const express = require('express');
const { verifyToken } = require('../middleware/customAuth');

const router = express.Router();

const MS_IN_DAY = 24 * 60 * 60 * 1000;

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
    user.studentId,
    user.studentNumber,
    user.username,
    user.email,
  ]
    .filter(Boolean)
    .forEach((value) => identifiers.add(String(value)));

  return identifiers;
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
    transaction.studentId,
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
    transaction.studentId,
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

router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const role = req.user.role || 'student';

    const [transactions, books, users] = await Promise.all([
      req.dbAdapter.findInCollection('transactions', {}),
      req.dbAdapter.findInCollection('books', {}),
      req.dbAdapter.findInCollection('users', {}),
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
          user.studentId,
          user.studentNumber,
          user.username,
          user.email,
        ],
        user,
      );
    });

    const identifiers = collectUserIdentifiers(req.user);
    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + 3 * MS_IN_DAY);

    const notifications = [];

    transactions.forEach((transaction) => {
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
        notifications.push({
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

      if (dueDate < now) {
        const overdueDays = daysOverdue(dueDate, now);
        notifications.push({
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

      if (dueDate <= dueSoonThreshold) {
        const daysRemaining = daysUntilDue(dueDate, now);
        notifications.push({
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

    notifications.sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    });

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

module.exports = router;
