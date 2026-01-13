const express = require('express');
const { verifyToken } = require('../middleware/customAuth');
const { getSettingsSnapshot, NOTIFICATION_DEFAULTS, getNotificationChannelState } = require('../utils/settingsCache');
const { buildBorrowRequestStaffMessage, buildNotePreview } = require('../utils/notificationCopy');

const router = express.Router();

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MS_IN_HOUR = 60 * 60 * 1000;
const REQUEST_RECENT_THRESHOLD_HOURS = 12;
const SYNTHETIC_READ_COLLECTION = 'notificationReads';

const ensureSettingsSnapshot = async (req) => {
  if (req.settingsSnapshot) {
    return req.settingsSnapshot;
  }
  const snapshot = await getSettingsSnapshot(req.dbAdapter);
  req.settingsSnapshot = snapshot;
  if (!req.systemSettings) {
    req.systemSettings = snapshot.system;
  }
  return snapshot;
};

const getNotificationSettings = async (req) => {
  try {
    const snapshot = await ensureSettingsSnapshot(req);
    return snapshot?.notifications || NOTIFICATION_DEFAULTS;
  } catch (error) {
    console.error('Notification settings retrieval error:', error);
    return NOTIFICATION_DEFAULTS;
  }
};

const getUserIdString = (user = {}) => {
  const candidates = [user.id, user._id, user.userId];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const normalized = String(candidate).trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const buildNotificationFingerprint = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidates = [
    item.fingerprint,
    item.link ? `${item.type || 'notification'}:${item.link}` : null,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const normalized = String(candidate).trim();
    if (normalized) {
      return normalized;
    }
  }

  if (item.title || item.message) {
    const parts = [item.type || 'notification'];
    if (item.title) {
      parts.push(item.title);
    }
    if (item.message) {
      parts.push(item.message);
    }
    const fingerprint = parts.join(':').trim();
    if (fingerprint) {
      return fingerprint;
    }
  }

  return null;
};

const getNotificationIdentifier = (item) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const candidates = [
    item.id,
    item._id,
    item.transactionId,
    item?.meta?.transactionId,
    buildNotificationFingerprint(item),
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const normalized = String(candidate).trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const ensureNotificationIdentifiers = (notification) => {
  if (!notification || typeof notification !== 'object') {
    return notification;
  }

  const identifier = getNotificationIdentifier(notification);
  if (identifier) {
    if (!notification.id) {
      notification.id = identifier;
    }
    if (!notification._id) {
      notification._id = identifier;
    }
  }

  const fingerprint = buildNotificationFingerprint(notification);
  if (fingerprint) {
    notification.fingerprint = fingerprint;
  }

  return notification;
};

const loadUserReadSet = async (dbAdapter, userId) => {
  if (!userId) {
    return new Set();
  }

  try {
    const entries = await dbAdapter.findInCollection(SYNTHETIC_READ_COLLECTION, {
      userId,
    });

    const identifiers = entries
      .map((entry) => entry.notificationId)
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    return new Set(identifiers);
  } catch (error) {
    console.error('Notifications read-state load error:', error);
    return new Set();
  }
};

const persistSyntheticReadState = async (dbAdapter, userId, notificationId, read) => {
  if (!userId || !notificationId) {
    return null;
  }

  const normalizedUserId = String(userId).trim();
  const normalizedNotificationId = String(notificationId).trim();

  if (!normalizedUserId || !normalizedNotificationId) {
    return null;
  }

  const existing = await dbAdapter.findOneInCollection(
    SYNTHETIC_READ_COLLECTION,
    {
      userId: normalizedUserId,
      notificationId: normalizedNotificationId,
    },
  );

  if (read) {
    if (existing) {
      const updated = await dbAdapter.updateInCollection(
        SYNTHETIC_READ_COLLECTION,
        { _id: existing._id },
        { read: true },
      );
      return updated || existing;
    }

    return await dbAdapter.insertIntoCollection(SYNTHETIC_READ_COLLECTION, {
      userId: normalizedUserId,
      notificationId: normalizedNotificationId,
      read: true,
    });
  }

  if (existing) {
    await dbAdapter.deleteFromCollection(SYNTHETIC_READ_COLLECTION, {
      _id: existing._id,
    });
  }

  return null;
};

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const resolveNotificationTimeMs = (notification) => {
  if (!notification || typeof notification !== 'object') {
    return 0;
  }

  const candidates = [
    notification.timestamp,
    notification?.meta?.requestCreatedAt,
    notification.createdAt,
    notification.updatedAt,
  ];

  for (const candidate of candidates) {
    const date = toDate(candidate);
    if (date) {
      return date.getTime();
    }
  }

  return 0;
};

const registerInMap = (map, candidates, value) => {
  candidates
    .map((candidate) =>
      candidate !== undefined && candidate !== null ? String(candidate) : null,
    )
    .filter(Boolean)
    .forEach((key) => {
      if (!map.has(key)) {
        map.set(key, value);
      }
    });
};

const collectUserIdentifiers = (user) => {
  const identifiers = new Set();
  if (!user) return identifiers;

  [
    user.id,
    user._id,
    user.userId,
    user.libraryCardNumber,
    user?.library?.cardNumber,
    user.username,
    user.email,
  ]
    .filter(Boolean)
    .forEach((value) => identifiers.add(String(value)));

  return identifiers;
};

const normalizeRole = (role) => {
  if (!role && role !== 0) {
    return '';
  }
  const value = String(role).trim().toLowerCase();
  if (!value) {
    return '';
  }
  switch (value) {
    case 'super admin':
    case 'super-admin':
    case 'superadmin':
    case 'administrator':
      return 'admin';
    default:
      return value;
  }
};

const buildRoleTargets = (role) => {
  const normalized = normalizeRole(role);
  if (!normalized) {
    return [];
  }

  const targets = new Set();
  targets.add(normalized);
  if (!normalized.endsWith('s')) {
    targets.add(`${normalized}s`);
  }

  if (normalized === 'admin') {
    targets.add('librarian');
    targets.add('librarians');
    targets.add('staff');
    targets.add('staffs');
  } else if (normalized === 'librarian') {
    targets.add('staff');
    targets.add('staffs');
  }

  return Array.from(targets);
};

const shouldDeliverPersistentNotification = (notification, context = {}) => {
  if (!notification || notification.archived) {
    return false;
  }

  const recipients = Array.isArray(notification.recipients)
    ? notification.recipients
    : [];

  if (recipients.length === 0) {
    return true;
  }

  const identifiers = context.identifiers instanceof Set ? context.identifiers : new Set();
  const roleTargets = Array.isArray(context.roleTargets) ? context.roleTargets : [];
  const normalizedRoleTargets = roleTargets.map((value) => normalizeRole(value)).filter(Boolean);

  const normalizedRecipients = recipients
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter(Boolean);

  const excludedRoleTokens = [
    ...(Array.isArray(notification.excludeRoles) ? notification.excludeRoles : []),
    ...(Array.isArray(notification?.meta?.excludeRoles) ? notification.meta.excludeRoles : []),
  ]
    .map((value) => normalizeRole(value))
    .filter(Boolean);

  if (excludedRoleTokens.length > 0 && normalizedRoleTargets.length > 0) {
    const shouldExclude = normalizedRoleTargets.some((target) => excludedRoleTokens.includes(target));
    if (shouldExclude) {
      return false;
    }
  }

  if (normalizedRecipients.length === 0) {
    return true;
  }

  const broadcast = normalizedRecipients.some((value) => {
    const normalized = value.toLowerCase();
    return normalized === 'all' || normalized === '*' || normalized === 'everyone';
  });
  if (broadcast) {
    return true;
  }

  const userMatch = normalizedRecipients.some((value) => identifiers.has(value));
  if (userMatch) {
    return true;
  }

  if (normalizedRoleTargets.length > 0) {
    const recipientRoleTokens = normalizedRecipients.map((value) => value.toLowerCase());
    const match = normalizedRoleTargets.some((target) => recipientRoleTokens.includes(target));
    if (match) {
      return true;
    }
  }

  return false;
};

const resolveTransactionBook = (transaction, bookMap) => {
  const collections = [];
  if (Array.isArray(transaction.items)) collections.push(transaction.items);
  if (Array.isArray(transaction.books)) collections.push(transaction.books);

  for (const list of collections) {
    for (const item of list) {
      const candidates = [item.bookId, item.id, item._id];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const book = bookMap.get(String(candidate));
        if (book) return book;
      }
      if (item.title) {
        return item;
      }
    }
  }

  const candidates = [
    transaction.bookId,
    transaction?.book?.id,
    transaction?.book?._id,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const book = bookMap.get(String(candidate));
    if (book) return book;
  }

  if (transaction.bookTitle) {
    return { title: transaction.bookTitle, author: transaction.bookAuthor };
  }

  return null;
};

const resolveTransactionBorrower = (transaction, userMap) => {
  const candidates = [
    transaction.userId,
    transaction?.user?.id,
    transaction?.user?._id,
    transaction.borrowerId,
    transaction.borrowerLibraryCardNumber,
    transaction?.user?.userId,
    transaction?.user?.username,
    transaction?.user?.email,
    transaction.borrowerCardNumber,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const user = userMap.get(String(candidate));
    if (user) return user;
  }

  return transaction.user || null;
};

const buildTransactionSummary = (transaction, context) => {
  const { bookMap, userMap } = context;
  const book = resolveTransactionBook(transaction, bookMap);
  const borrower = resolveTransactionBorrower(transaction, userMap);

  const title =
    book?.title ||
    book?.name ||
    transaction.bookTitle ||
    transaction.title ||
    '';

  const borrowerName = borrower
    ? [borrower.firstName, borrower.lastName]
        .filter(Boolean)
        .join(' ') ||
      borrower.username ||
      borrower.email ||
      transaction.borrowerName ||
      ''
    : transaction.borrowerName || '';

  return {
    title,
    borrower: borrowerName,
    dueDate: toDate(transaction.dueDate),
    dueIso: toIsoString(transaction.dueDate),
    status: (transaction.status || '').toLowerCase(),
    itemCount: Array.isArray(transaction.items) ? transaction.items.length : 0,
    requestId:
      transaction.id ||
      transaction._id ||
      transaction.transactionCode ||
      transaction.referenceNumber ||
      transaction.recordId ||
      transaction.borrowingId ||
      null,
    requestType: transaction.type || '',
    notes: typeof transaction.notes === 'string' ? transaction.notes : '',
    timestamp:
      toIsoString(transaction.updatedAt) ||
      toIsoString(transaction.dueDate) ||
      toIsoString(transaction.borrowDate) ||
      toIsoString(transaction.createdAt),
  };
};

const transactionBelongsToUser = (transaction, identifiers) => {
  const candidates = [
    transaction.userId,
    transaction?.user?.id,
    transaction?.user?._id,
    transaction.borrowerId,
    transaction.borrowerLibraryCardNumber,
    transaction?.user?.userId,
    transaction?.user?.username,
    transaction?.user?.email,
    transaction.borrowerCardNumber,
  ];

  return candidates
    .filter(Boolean)
    .map((value) => String(value))
    .some((candidate) => identifiers.has(candidate));
};

const daysOverdue = (dueDate, reference) =>
  Math.max(1, Math.floor((reference.getTime() - dueDate.getTime()) / MS_IN_DAY));

const daysUntilDue = (dueDate, reference) =>
  Math.max(0, Math.ceil((dueDate.getTime() - reference.getTime()) / MS_IN_DAY));

const overdueSeverity = (days) => {
  if (days >= 7) return 'high';
  if (days >= 3) return 'medium';
  return 'low';
};

const formatRelativeAge = (date, reference = new Date()) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const referenceDate = reference instanceof Date ? reference : new Date(reference);
  if (Number.isNaN(referenceDate.getTime())) {
    return null;
  }
  const diffMs = referenceDate.getTime() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return null;
  }
  if (diffMs < 60 * 1000) {
    return 'moments';
  }
  if (diffMs < MS_IN_HOUR) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (diffMs < MS_IN_DAY) {
    const hours = Math.max(1, Math.round(diffMs / MS_IN_HOUR));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.max(1, Math.round(diffMs / MS_IN_DAY));
  return `${days} day${days === 1 ? '' : 's'}`;
};

const formatShortDateLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  } catch (error) {
    return null;
  }
};

const decorateBorrowRequestNotification = (notification, referenceDate = new Date()) => {
  if (!notification || notification.type !== 'request') {
    return notification;
  }

  const createdAt =
    toDate(notification?.meta?.requestCreatedAt) ||
    toDate(notification.createdAt) ||
    toDate(notification.timestamp);

  if (!createdAt) {
    return notification;
  }

  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(now.getTime())) {
    return notification;
  }

  const ageMs = now.getTime() - createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return notification;
  }

  const isRecent = ageMs <= REQUEST_RECENT_THRESHOLD_HOURS * MS_IN_HOUR;
  if (isRecent) {
    if (!notification.timestamp) {
      notification.timestamp = createdAt.toISOString();
    }
    return notification;
  }

  const hasBorrowRequestTitle = typeof notification.title === 'string' && /borrow request/i.test(notification.title);
  if (hasBorrowRequestTitle) {
    notification.title = 'Pending borrow request';
  }

  const rawMessage = typeof notification.message === 'string' ? notification.message.trim() : '';
  const baseMessage = (() => {
    if (!rawMessage) {
      return 'Borrow request pending review';
    }
    const pendingIndex = rawMessage.toLowerCase().indexOf('pending ');
    if (pendingIndex === -1) {
      return rawMessage.replace(/[.]+$/, '');
    }
    return rawMessage.slice(0, pendingIndex).trim().replace(/[.]+$/, '');
  })();

  const ageLabel = formatRelativeAge(createdAt, now);
  const dateLabel = formatShortDateLabel(createdAt);
  const pendingClause = ageLabel
    ? `Pending for ${ageLabel}${dateLabel ? ` (requested ${dateLabel})` : ''}`
    : dateLabel
      ? `Pending since ${dateLabel}`
      : 'Pending review';

  const lead = baseMessage ? `${baseMessage}${baseMessage.endsWith('.') ? '' : '.'}` : '';
  notification.message = `${lead} ${pendingClause}.`.trim().replace(/\.\./g, '.');
  notification.meta = {
    ...(notification.meta || {}),
    requestCreatedAt: createdAt.toISOString(),
    requestAgeHours: Math.round(ageMs / MS_IN_HOUR),
  };

  if (!notification.timestamp) {
    notification.timestamp = createdAt.toISOString();
  }

  return notification;
};

router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const role = req.user.role || 'student';
    const normalizedRole = normalizeRole(role);
    const userId = getUserIdString(req.user);
    const notificationSettings = await getNotificationSettings(req);
    const channelState = getNotificationChannelState(notificationSettings);
    if (!channelState.hasActiveChannel) {
      return res.json({
        notifications: [],
        total: 0,
        generatedAt: new Date().toISOString(),
      });
    }
    const dueRemindersEnabled = notificationSettings.dueDateReminders !== false;
    const overdueEnabled = notificationSettings.overdueNotifications !== false;
    const reservationEnabled = notificationSettings.reservationNotifications !== false;
    const reminderDaysBefore = Math.max(parseInt(notificationSettings.reminderDaysBefore, 10) || 0, 0);

    const [transactions, books, users, persistentRecords] = await Promise.all([
      req.dbAdapter.findInCollection('transactions', {}),
      req.dbAdapter.findInCollection('books', {}),
      req.dbAdapter.findInCollection('users', {}),
      req.dbAdapter.findInCollection('notifications', {}),
    ]);

    const bookMap = new Map();
    const userMap = new Map();

    books.forEach((book) => {
      registerInMap(bookMap, [book._id, book.id, book.bookId], book);
    });

    users.forEach((user) => {
      registerInMap(
        userMap,
        [
          user._id,
          user.id,
          user.userId,
          user.libraryCardNumber,
          user?.library?.cardNumber,
          user.username,
          user.email,
        ],
        user,
      );
    });

    const identifiers = collectUserIdentifiers(req.user);
    const roleTargets = buildRoleTargets(role);
    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + reminderDaysBefore * MS_IN_DAY);

    const notifications = [];
    const registerNotification = (payload) => {
      if (!payload) {
        return;
      }
      const normalized = ensureNotificationIdentifiers({ ...payload, read: false });
      normalized.read = false;
      notifications.push(normalized);
    };

    // Admin dashboard skips transaction-driven alerts
    const transactionSource = normalizedRole === 'admin' ? [] : transactions;

    transactionSource.forEach((transaction) => {
      if (role === 'student' && !transactionBelongsToUser(transaction, identifiers)) {
        return;
      }

      const summary = buildTransactionSummary(transaction, { bookMap, userMap });
      const baseId = String(
        transaction.id ||
          transaction._id ||
          transaction.transactionCode ||
          transaction.referenceNumber ||
          transaction.recordId ||
          transaction.borrowingId ||
          `${Date.now()}-${Math.random()}`,
      );
      const link = `/transactions/${String(transaction.id || transaction._id || '')}`;
      const meta = {
        borrower: summary.borrower || null,
        dueDate: summary.dueIso,
        status: summary.status || null,
      };

      const status = summary.status;
      const dueDate = summary.dueDate;
      const isReturned = status === 'returned' || status === 'completed';
      const isMissing = status === 'missing' || status === 'lost';

      if (isMissing) {
        registerNotification({
          id: `missing-${baseId}`,
          type: 'missing',
          title: summary.title || 'Missing item',
          message:
            role === 'student'
              ? 'Please contact the librarian about this missing item.'
              : `${summary.borrower || 'A borrower'} reported a missing item.`,
          timestamp: summary.timestamp || toIsoString(now),
          severity: 'high',
          link,
          meta,
        });
        return;
      }

      if (!dueDate || isReturned) {
        return;
      }

      // Surface borrow requests to staff as actionable notifications
      if (status === 'requested' && role !== 'student') {
        if (!reservationEnabled) {
          return;
        }
        const staffRequestMessage = buildBorrowRequestStaffMessage({
          borrowerName: summary.borrower || 'A borrower',
          transactionId: summary.requestId || transaction.id || transaction._id,
          transactionType: summary.requestType || transaction.type,
          itemCount: summary.itemCount || (Array.isArray(transaction.items) ? transaction.items.length : 0),
          notes: summary.notes || transaction.notes || ''
        });
        registerNotification({
          id: `request-${baseId}`,
          type: 'request',
          title: summary.title || 'Borrow request',
          message: staffRequestMessage,
          timestamp: summary.timestamp || toIsoString(now),
          severity: 'info',
          link,
          meta: {
            ...meta,
            transactionId: summary.requestId || transaction.id || transaction._id,
            itemCount: summary.itemCount || (Array.isArray(transaction.items) ? transaction.items.length : 0),
            requestType: summary.requestType || transaction.type || 'regular',
            notesPreview: buildNotePreview(summary.notes || transaction.notes || '')
          },
        });
        return;
      }

      if (dueDate < now) {
        if (!overdueEnabled) {
          return;
        }
        const overdueDays = daysOverdue(dueDate, now);
        registerNotification({
          id: `overdue-${baseId}`,
          type: 'overdue',
          title: summary.title || 'Overdue item',
          message:
            role === 'student'
              ? `This item is ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue.`
              : `${summary.borrower || 'A borrower'} is ${overdueDays} day${
                  overdueDays === 1 ? '' : 's'
                } overdue.`,
          timestamp: summary.timestamp || toIsoString(now),
          severity: overdueSeverity(overdueDays),
          link,
          meta: {
            ...meta,
            daysOverdue: overdueDays,
          },
        });
        return;
      }

      if (dueRemindersEnabled && dueDate <= dueSoonThreshold) {
        const daysRemaining = daysUntilDue(dueDate, now);
        registerNotification({
          id: `due-soon-${baseId}`,
          type: 'due-soon',
          title: summary.title || 'Upcoming due date',
          message:
            role === 'student'
              ? `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
              : `${summary.borrower || 'A borrower'} is due in ${daysRemaining} day${
                  daysRemaining === 1 ? '' : 's'
                }.`,
          timestamp: summary.timestamp || summary.dueIso || toIsoString(now),
          severity: daysRemaining <= 1 ? 'medium' : 'info',
          link,
          meta: {
            ...meta,
            daysUntilDue: daysRemaining,
          },
        });
      }
    });

    const viewerId = userId;
    const persistentContext = { identifiers, roleTargets };
    (Array.isArray(persistentRecords) ? persistentRecords : [])
      .filter((entry) => shouldDeliverPersistentNotification(entry, persistentContext))
      .forEach((entry) => {
        const normalized = ensureNotificationIdentifiers({ ...entry });
        const readByList = Array.isArray(entry.readBy)
          ? entry.readBy.map((value) => String(value))
          : [];
        normalized.read = viewerId ? readByList.includes(viewerId) : false;
        const timestampCandidate =
          normalized.timestamp ||
          normalized.updatedAt ||
          normalized.createdAt ||
          entry.timestamp;
        normalized.timestamp =
          toIsoString(timestampCandidate) ||
          toIsoString(new Date());
        if (!normalized.link && normalized.transactionId) {
          normalized.link = `/transactions/${String(normalized.transactionId)}`;
        }
        normalized.source = normalized.source || 'persistent';
        decorateBorrowRequestNotification(normalized, now);
        notifications.push(normalized);
      });

    const readIdSet = await loadUserReadSet(req.dbAdapter, userId);
    notifications.forEach((entry) => {
      const identifier = getNotificationIdentifier(entry);
      if (identifier && readIdSet.has(identifier)) {
        entry.read = true;
      }
    });

    notifications.sort((a, b) => resolveNotificationTimeMs(b) - resolveNotificationTimeMs(a));

    res.json({
      notifications: notifications.slice(0, limit),
      total: notifications.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Persistent notifications endpoints
router.get('/persistent', verifyToken, async (req, res) => {
  try {
    const role = req.user?.role || 'student';
    const identifiers = collectUserIdentifiers(req.user);
    const roleTargets = buildRoleTargets(role);
    let items = await req.dbAdapter.findInCollection('notifications', {});
    items = items.filter((entry) => shouldDeliverPersistentNotification(entry, { identifiers, roleTargets }));
    items.sort((a, b) => resolveNotificationTimeMs(b) - resolveNotificationTimeMs(a));

    const viewerId = getUserIdString(req.user);
    const normalizedItems = items.map((entry) => {
      const readByList = Array.isArray(entry.readBy)
        ? entry.readBy.map((value) => String(value))
        : [];
      const normalized = ensureNotificationIdentifiers({ ...entry });
      normalized.read = viewerId ? readByList.includes(viewerId) : false;
      normalized.source = normalized.source || 'persistent';
      decorateBorrowRequestNotification(normalized);
      return normalized;
    });

    res.json({ notifications: normalizedItems });
  } catch (error) {
    console.error('Get persistent notifications error:', error);
    res.status(500).json({ message: 'Failed to fetch persistent notifications' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, message, type, recipients, meta } = req.body || {};
    if (!title || !message) return res.status(400).json({ message: 'Title and message required' });
    const entry = {
      title,
      message,
      type: type || 'info',
      recipients: Array.isArray(recipients) ? recipients : [],
      meta: meta || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      readBy: []
    };
    const created = await req.dbAdapter.insertIntoCollection('notifications', entry);
    res.status(201).json(created);
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const idParam = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!idParam) {
      return res.status(400).json({ message: 'Notification id is required' });
    }

    const requestBody = req.body || {};
    const shouldMarkRead =
      typeof requestBody.read === 'boolean' ? requestBody.read : true;
    const normalizedUserId = getUserIdString(req.user);

    if (!normalizedUserId) {
      return res.status(400).json({ message: 'User identifier unavailable' });
    }

    const item =
      (await req.dbAdapter.findOneInCollection('notifications', { id: idParam })) ||
      (await req.dbAdapter.findOneInCollection('notifications', { _id: idParam }));

    if (item) {
      const readBy = Array.isArray(item.readBy)
        ? item.readBy.map((value) => String(value))
        : [];
      const existingIndex = readBy.indexOf(normalizedUserId);

      if (shouldMarkRead && existingIndex === -1) {
        readBy.push(normalizedUserId);
      } else if (!shouldMarkRead && existingIndex !== -1) {
        readBy.splice(existingIndex, 1);
      }

      const query = item.id ? { id: item.id } : { _id: item._id };
      const updated = await req.dbAdapter.updateInCollection('notifications', query, {
        readBy,
        updatedAt: new Date(),
      });

      const responsePayload = updated || { ...item, readBy };
      responsePayload.read = readBy.includes(normalizedUserId);

      return res.json(responsePayload);
    }

    await persistSyntheticReadState(
      req.dbAdapter,
      normalizedUserId,
      idParam,
      shouldMarkRead,
    );

    return res.json({
      notificationId: idParam,
      userId: normalizedUserId,
      read: shouldMarkRead,
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await req.dbAdapter.deleteFromCollection('notifications', { id }) || await req.dbAdapter.deleteFromCollection('notifications', { _id: id });
    if (!deleted) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

module.exports = router;
