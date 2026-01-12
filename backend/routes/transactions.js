const express = require('express');
const { verifyToken, requireCirculation, logAction, setAuditContext } = require('../middleware/customAuth');
const { generateTransactionId, ensureTransactionId } = require('../utils/transactionIds');
const {
    getSettingsSnapshot,
    BORROWING_DEFAULTS,
    NOTIFICATION_DEFAULTS,
    getNotificationChannelState
} = require('../utils/settingsCache');
const { maybeNotifyLowInventory } = require('../utils/inventoryNotifications');
const { notifyRoles, notifyRecipients } = require('../utils/notificationChannels');
const { buildBorrowRequestStaffMessage, buildNotePreview, formatCountLabel } = require('../utils/notificationCopy');
const router = express.Router();
const DEFAULT_LIBRARY_TIMEZONE = process.env.LIBRARY_TIMEZONE || 'Asia/Manila';

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

const getBorrowingSettings = async (req) => {
    try {
        const snapshot = await ensureSettingsSnapshot(req);
        return snapshot?.borrowing || BORROWING_DEFAULTS;
    } catch (error) {
        console.error('Borrowing settings load error:', error);
        return BORROWING_DEFAULTS;
    }
};

const getLibrarySettings = async (req) => {
    try {
        const snapshot = await ensureSettingsSnapshot(req);
        return snapshot?.library || {
            openingTime: "08:00",
            closingTime: "17:00",
            operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            timezone: DEFAULT_LIBRARY_TIMEZONE,
        };
    } catch (error) {
        console.error('Library settings load error:', error);
        return {
            openingTime: "08:00",
            closingTime: "17:00",
            operatingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            timezone: DEFAULT_LIBRARY_TIMEZONE,
        };
    }
};

const parseTimeStringToMinutes = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    const ampmMatch = normalized.match(/^([0-9]{1,2})(?::([0-9]{1,2}))?\s*(am|pm)$/);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = parseInt(ampmMatch[2] || '0', 10);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) {
            return null;
        }
        const suffix = ampmMatch[3];
        if (suffix === 'pm' && hours < 12) {
            hours += 12;
        }
        if (suffix === 'am' && hours === 12) {
            hours = 0;
        }
        return hours * 60 + minutes;
    }

    const segments = normalized.split(':');
    if (segments.length < 2) {
        return null;
    }
    const hours = parseInt(segments[0], 10);
    const minutes = parseInt(segments[1], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return null;
    }
    return hours * 60 + minutes;
};

const getLibraryTimezone = (librarySettings = {}) => {
    const configured = librarySettings.timezone;
    if (configured && typeof configured === 'string' && configured.trim().length > 0) {
        return configured.trim();
    }
    return DEFAULT_LIBRARY_TIMEZONE;
};

const getZonedDayAndMinutes = (timeZone = DEFAULT_LIBRARY_TIMEZONE) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            weekday: 'long'
        });
        const parts = formatter.formatToParts(new Date());
        const weekday = parts.find((part) => part.type === 'weekday')?.value?.toLowerCase();
        const hourPart = parts.find((part) => part.type === 'hour')?.value;
        const minutePart = parts.find((part) => part.type === 'minute')?.value;
        const hour = hourPart !== undefined ? parseInt(hourPart, 10) : NaN;
        const minute = minutePart !== undefined ? parseInt(minutePart, 10) : NaN;
        if (weekday && !Number.isNaN(hour) && !Number.isNaN(minute)) {
            return { weekday, minutes: hour * 60 + minute };
        }
    } catch (error) {
        console.error('Zoned time calculation error:', error);
    }

    const fallback = new Date();
    return {
        weekday: fallback.toLocaleString('en-US', { weekday: 'long' }).toLowerCase(),
        minutes: fallback.getHours() * 60 + fallback.getMinutes()
    };
};

const isWithinOperatingHours = (librarySettings = {}) => {
    const timeZone = getLibraryTimezone(librarySettings);
    const { weekday: currentDay, minutes: currentMinutes } = getZonedDayAndMinutes(timeZone);

    const operatingDays = Array.isArray(librarySettings.operatingDays)
        ? librarySettings.operatingDays.map(day => String(day).toLowerCase())
        : [];

    if (operatingDays.length > 0 && !operatingDays.includes(currentDay)) {
        return false;
    }

    const openingMinutes = parseTimeStringToMinutes(librarySettings.openingTime) ?? 0;
    const closingMinutes = parseTimeStringToMinutes(librarySettings.closingTime) ?? (23 * 60 + 59);

    if (openingMinutes === closingMinutes) {
        return true;
    }

    if (closingMinutes > openingMinutes) {
        return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
    }

    // Handle overnight windows (e.g., 20:00 - 06:00)
    return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
};

const getNotificationSettings = async (req) => {
    try {
        const snapshot = await ensureSettingsSnapshot(req);
        return snapshot?.notifications || NOTIFICATION_DEFAULTS;
    } catch (error) {
        console.error('Notification settings load error:', error);
        return NOTIFICATION_DEFAULTS;
    }
};

const normalizeTransactionType = (value) => {
    if (!value) return 'regular';
    return String(value).trim().toLowerCase();
};

const isOvernightType = (type) => normalizeTransactionType(type) === 'overnight';
const isAnnualType = (type) => {
    const normalized = normalizeTransactionType(type);
    return normalized === 'annual' || normalized === 'annual-set';
};

const resolveBorrowWindowDays = (type, borrowingSettings) => {
    if (isOvernightType(type)) {
        return 1;
    }
    const fallback = BORROWING_DEFAULTS.maxBorrowDays || 14;
    const configured = Number(borrowingSettings?.maxBorrowDays) || fallback;
    return configured > 0 ? configured : fallback;
};

const calculateDueDate = (borrowDate, maxBorrowDays = 14) => {
    const dueDate = new Date(borrowDate);
    dueDate.setDate(dueDate.getDate() + maxBorrowDays);
    return dueDate;
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const calculateFine = (dueDate, returnDate, options = {}) => {
    const finePerDay = Number(options.finePerDay) || 5;
    const gracePeriodDays = Number(options.gracePeriodDays) || 0;
    if (!dueDate || !returnDate || returnDate <= dueDate) return 0;
    const diffTime = returnDate - dueDate;
    const diffDays = Math.ceil(diffTime / MS_IN_DAY);
    const chargeableDays = Math.max(0, diffDays - gracePeriodDays);
    if (chargeableDays === 0) {
        return 0;
    }
    return chargeableDays * finePerDay;
};

const normalizeStatus = (status) => {
    if (!status) return 'pending';
    return status === 'borrowed' ? 'active' : status;
};

const resolveTransactionDueDate = (transaction = {}) => {
    if (!transaction || typeof transaction !== 'object') {
        return null;
    }

    const directSources = [
        transaction.dueDate,
        transaction.metadata?.providedDueDate,
        transaction.expectedReturnDate,
        transaction.returnBy
    ];

    let source = directSources.find(value => Boolean(value)) || null;

    if (!source && Array.isArray(transaction.items)) {
        for (const item of transaction.items) {
            if (!item) continue;
            const itemSource = item.dueDate || item.expectedReturnDate || item.returnBy;
            if (itemSource) {
                source = itemSource;
                break;
            }
        }
    }

    if (!source) {
        return null;
    }

    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed;
};

const matchesStatusFilter = (transaction = {}, filterValue = '', nowMs = Date.now()) => {
    const normalizedFilter = String(filterValue || '').trim().toLowerCase();
    if (!normalizedFilter || normalizedFilter === 'all') {
        return true;
    }

    const normalizedStatus = normalizeStatus(transaction.status);

    switch (normalizedFilter) {
        case 'active':
        case 'borrowed':
            return normalizedStatus === 'active';
        case 'requested':
        case 'pending':
            return normalizedStatus === 'requested' || normalizedStatus === 'pending';
        case 'overdue': {
            if (normalizedStatus !== 'active') {
                return false;
            }
            const dueDate = resolveTransactionDueDate(transaction);
            return Boolean(dueDate) && dueDate.getTime() < nowMs;
        }
        default:
            return normalizedStatus === normalizedFilter;
    }
};

const matchesTypeFilter = (transaction = {}, filterValue = '') => {
    const normalizedFilter = String(filterValue || '').trim().toLowerCase();
    if (!normalizedFilter || normalizedFilter === 'all') {
        return true;
    }

    const transactionType = normalizeTransactionType(transaction.type);
    if (normalizedFilter === 'annual') {
        return isAnnualType(transactionType);
    }
    return transactionType === normalizedFilter;
};

const buildLookupMap = (records, keysResolver) => {
    const map = new Map();
    records.forEach(record => {
        const keys = keysResolver(record);
        keys.filter(Boolean).forEach(key => {
            map.set(String(key), record);
        });
    });
    return map;
};

const getBorrowerName = (user) => {
    if (!user) return 'Unknown Borrower';
    if (user.fullName) return user.fullName;
    const nameParts = [user.firstName, user.middleName, user.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    if (nameParts) return nameParts;
    return user.username || user.email || 'Unknown Borrower';
};

const buildRecipientList = (...values) => {
    return Array.from(
        new Set(
            values
                .flat()
                .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
                .map(value => String(value))
        )
    );
};

const findUserByAnyIdentifier = async (dbAdapter, identifier) => {
    if (!identifier || !dbAdapter) {
        return null;
    }

    const probes = [
        { id: identifier },
        { _id: identifier },
        { userId: identifier },
        { libraryCardNumber: identifier },
        { username: identifier },
        { email: identifier }
    ];

    for (const query of probes) {
        try {
            const user = await dbAdapter.findOneInCollection('users', query);
            if (user) {
                return user;
            }
        } catch (error) {
            console.warn('User lookup failed for query', query, error.message || error);
        }
    }

    return null;
};

const findTransactionByIdentifier = async(dbAdapter, identifier) => {
    if (!identifier) return null;
    const idValue = String(identifier);
    let transaction = await dbAdapter.findOneInCollection('transactions', { id: idValue });
    if (!transaction) {
        transaction = await dbAdapter.findOneInCollection('transactions', { _id: idValue });
    }

    if (transaction && !transaction.id) {
        const generatedId = ensureTransactionId(transaction);
        if (generatedId) {
            const query = transaction._id ? { _id: transaction._id } : transaction.id ? { id: transaction.id } : null;
            if (query) {
                await dbAdapter.updateInCollection('transactions', query, { id: generatedId });
            }
            transaction.id = generatedId;
        }
    }

    return transaction;
};

const ACTIVE_TRANSACTION_STATUSES = new Set(['borrowed', 'active', 'pending']);

const loadBorrowingLookups = async(dbAdapter) => {
    const [users, books] = await Promise.all([
        dbAdapter.findInCollection('users', {}),
        dbAdapter.findInCollection('books', {})
    ]);

    const usersLookup = buildLookupMap(users, user => [user.id, user._id, user.uid, user.userId, user.libraryCardNumber, user.email]);
    const booksLookup = buildLookupMap(books, book => [book.id, book._id, book.bookId, book.isbn]);
    const copiesLookup = new Map();

    books.forEach(book => {
        (book.copies || []).forEach(copy => {
            if (copy.copyId) {
                copiesLookup.set(String(copy.copyId), { book, copy });
            }
        });
    });

    return { usersLookup, booksLookup, copiesLookup };
};

const resolveItemBookMetadata = (item = {}, lookups = {}) => {
    const copyMatch = lookups.copiesLookup?.get(String(item.copyId || ''));
    const matchingBook = copyMatch?.book || lookups.booksLookup?.get(String(item.bookId)) || null;

    const bookTitle = matchingBook?.title || item.title || item.isbn || 'Unknown Book';
    const author = matchingBook?.author || matchingBook?.publisher || item.author || '';

    return {
        ...item,
        bookTitle,
        author
    };
};

const enrichTransactionsWithBookMetadata = async(transactions, dbAdapter) => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return Array.isArray(transactions) ? transactions : [];
    }

    const lookups = await loadBorrowingLookups(dbAdapter);

    return transactions.map(transaction => {
        const items = (transaction.items || []).map(item => resolveItemBookMetadata(item, lookups));
        const titleList = items.map(item => item.bookTitle).filter(Boolean);
        const authorList = items.map(item => item.author).filter(Boolean);

        return {
            ...transaction,
            items,
            bookTitle: titleList.length > 0 ? titleList.join(', ') : (transaction.bookTitle || 'Unknown Book'),
            bookAuthor: authorList.length > 0 ? authorList.join(', ') : (transaction.bookAuthor || '')
        };
    });
};

const buildBorrowedRecord = ({ transaction, item, lookups }) => {
    const documentId = transaction.id || transaction._id || `txn_${transaction.userId || 'unknown'}`;
    const borrower = lookups.usersLookup.get(String(transaction.userId)) || null;
    const borrowerName = getBorrowerName(borrower);
    const borrowerEmail = borrower?.email || borrower?.username || '';

    const copyMatch = lookups.copiesLookup.get(String(item.copyId || ''));
    const matchingBook = copyMatch?.book || lookups.booksLookup.get(String(item.bookId)) || null;

    const bookTitle = matchingBook?.title || item.title || item.isbn || 'Unknown Book';
    const author = matchingBook?.author || matchingBook?.publisher || item.author || '';

    const baseRowId = `${documentId}_${item.copyId || item.bookId || item.isbn || 'item'}`;

    return {
        transactionId: documentId,
        rowId: baseRowId,
        _id: baseRowId,
        borrowerId: transaction.userId,
        borrowerName,
        borrowerEmail,
        copyId: item.copyId || '',
        bookTitle,
        author,
        borrowDate: transaction.borrowDate || transaction.createdAt || null,
        dueDate: transaction.dueDate || null,
        status: normalizeStatus(transaction.status),
        fine: transaction.fineAmount || transaction.fine || 0
    };
};

const normalizeIdValue = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
};

const mergeRequestAssignments = (items = [], assignments = []) => {
    const consumedIndices = new Set();

    const findMatchIndex = (matcher) => {
        for (let idx = 0; idx < assignments.length; idx += 1) {
            if (consumedIndices.has(idx)) continue;
            const assignment = assignments[idx];
            if (matcher(assignment, idx)) {
                return idx;
            }
        }
        return -1;
    };

    const mergedItems = [];
    const missingAssignments = [];

    items.forEach((item, index) => {
        const merged = { ...item };
        if (merged.copyId) {
            mergedItems.push(merged);
            return;
        }

        const requestItemId = normalizeIdValue(merged.requestItemId);
        const bookId = normalizeIdValue(merged.bookId);

        let matchIndex = -1;
        if (requestItemId) {
            matchIndex = findMatchIndex((assignment) => normalizeIdValue(assignment.requestItemId) === requestItemId);
        }
        if (matchIndex === -1 && bookId) {
            matchIndex = findMatchIndex((assignment) => normalizeIdValue(assignment.bookId) === bookId);
        }
        if (matchIndex === -1) {
            matchIndex = findMatchIndex((assignment) => Boolean(normalizeIdValue(assignment.copyId)));
        }

        if (matchIndex === -1) {
            missingAssignments.push({
                index,
                requestItemId: requestItemId || null,
                bookId: bookId || null
            });
            mergedItems.push(merged);
            return;
        }

        const assignment = assignments[matchIndex];
        consumedIndices.add(matchIndex);

        mergedItems.push({
            ...merged,
            copyId: normalizeIdValue(assignment.copyId),
            bookId: normalizeIdValue(assignment.bookId) || bookId
        });
    });

    const unusedAssignments = assignments
        .map((assignment, index) => ({ ...assignment, index }))
        .filter(entry => !consumedIndices.has(entry.index));

    return { mergedItems, missingAssignments, unusedAssignments };
};

const processReturnTransaction = async({
    dbAdapter,
    transaction,
    items,
    actorId,
    notes = '',
    returnDateOverride = null,
    borrowingSettings = BORROWING_DEFAULTS,
    notificationOptions = {}
}) => {
    if (!transaction) {
        throw new Error('Transaction not found');
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('No items provided for return');
    }
    if (transaction.status === 'returned') {
        throw new Error('Transaction already returned');
    }

    const {
        notificationSettings = NOTIFICATION_DEFAULTS,
        channelState: providedChannelState,
        actorName = '',
        enabled = true
    } = notificationOptions || {};
    const channelState = providedChannelState || getNotificationChannelState(notificationSettings);
    const allowReturnNotifications = enabled !== false && notificationSettings?.returnNotifications !== false;

    const finePerDay = Number(borrowingSettings?.finePerDay) || BORROWING_DEFAULTS.finePerDay;
    const enableFines = borrowingSettings?.enableFines !== false;
    const gracePeriodDays = Number(borrowingSettings?.gracePeriodDays) || BORROWING_DEFAULTS.gracePeriodDays;
    const maxFineAmount = Number(borrowingSettings?.maxFineAmount) || 0;

    const allBooks = await dbAdapter.findInCollection('books', {});
    let returnDate = returnDateOverride ? new Date(returnDateOverride) : new Date();
    if (Number.isNaN(returnDate.getTime())) {
        returnDate = new Date();
    }
    const dueDateSource = transaction.dueDate || transaction.metadata?.providedDueDate || null;
    const dueDate = dueDateSource ? new Date(dueDateSource) : null;
    let totalFine = 0;
    let returnedItems = 0;

    for (const returnItem of items) {
        const { copyId, condition = 'good' } = returnItem;
        if (!copyId) continue;

        let targetBook = null;
        for (const book of allBooks) {
            const copy = book.copies?.find(c => c.copyId === copyId);
            if (copy) {
                targetBook = book;
                break;
            }
        }

        if (!targetBook) continue;

        const updatedCopies = (targetBook.copies || []).map(c =>
            c.copyId === copyId
                ? {
                    ...c,
                    status: 'available',
                    condition,
                    updatedAt: new Date(),
                    updatedBy: actorId
                }
                : c
        );

        const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
        const bookQuery = targetBook.id ? { id: targetBook.id } : { _id: targetBook._id };
        await dbAdapter.updateInCollection('books', bookQuery, {
            copies: updatedCopies,
            availableCopies,
            updatedAt: new Date()
        });
        await maybeNotifyLowInventory(dbAdapter, {
            ...targetBook,
            copies: updatedCopies,
            availableCopies
        }, { source: 'transaction-return' });

        returnedItems++;
    }

    if (enableFines && dueDate && !Number.isNaN(dueDate.getTime()) && returnDate > dueDate && returnedItems > 0) {
        const perItemFine = calculateFine(dueDate, returnDate, {
            finePerDay,
            gracePeriodDays
        });
        totalFine = perItemFine * returnedItems;
        if (maxFineAmount > 0) {
            totalFine = Math.min(totalFine, maxFineAmount);
        }
    }

    const updatedItems = (transaction.items || []).map(item => {
        const wasReturned = items.some(returnItem => returnItem.copyId === item.copyId);
        if (!wasReturned) return item;
        return { ...item, status: 'returned', returnedAt: returnDate };
    });

    const hasOutstandingItems = updatedItems.some(item => item.status !== 'returned');
    const updatedStatus = hasOutstandingItems ? 'borrowed' : 'returned';

    const transactionQuery = transaction.id ? { id: transaction.id } : { _id: transaction._id };
    await dbAdapter.updateInCollection('transactions', transactionQuery, {
        status: updatedStatus,
        items: updatedItems,
        returnDate,
        fineAmount: totalFine,
        returnNotes: notes || '',
        updatedAt: new Date(),
        returnedBy: actorId
    });

    let user = await dbAdapter.findOneInCollection('users', { id: transaction.userId });
    if (!user) {
        user = await dbAdapter.findOneInCollection('users', { _id: transaction.userId });
    }
    if (user) {
        const stats = user.borrowingStats || { totalBorrowed: 0, currentlyBorrowed: 0, totalFines: 0, totalReturned: 0 };
        const updatedStats = {
            totalBorrowed: stats.totalBorrowed || 0,
            currentlyBorrowed: Math.max(0, (stats.currentlyBorrowed || 0) - returnedItems),
            totalFines: (stats.totalFines || 0) + totalFine,
            totalReturned: (stats.totalReturned || 0) + returnedItems
        };
        const userQuery = user.id ? { id: user.id } : { _id: user._id };
        await dbAdapter.updateInCollection('users', userQuery, {
            borrowingStats: updatedStats,
            updatedAt: new Date()
        });
    }

    const daysOverdue = totalFine > 0 && dueDate ? Math.ceil((returnDate - dueDate) / (1000 * 60 * 60 * 24)) : 0;
    const borrowerRecipients = user
        ? buildRecipientList(
            user.id,
            user._id,
            user.userId,
            user.libraryCardNumber,
            user.email,
            user.username
        )
        : buildRecipientList(transaction.userId);
    const borrowerName = user ? getBorrowerName(user) : getBorrowerName(transaction.user || {});

    if (
        allowReturnNotifications &&
        channelState?.hasActiveChannel &&
        borrowerRecipients.length > 0 &&
        returnedItems > 0
    ) {
        try {
            const completionClause = hasOutstandingItems
                ? 'Some items are still checked out.'
                : 'All items on this transaction are now returned.';
            const fineClause = totalFine > 0
                ? `Return fine: PHP ${totalFine.toFixed(2)}.`
                : 'No fines were added.';
            const processedByClause = actorName ? `Processed by ${actorName}.` : '';
            const messageParts = [
                `We recorded the return of ${formatCountLabel(returnedItems, 'item')} for transaction ${transaction.id || transaction._id}.`,
                completionClause,
                processedByClause,
                fineClause
            ].filter(Boolean);

            await dbAdapter.insertIntoCollection('notifications', {
                title: 'Items returned',
                message: messageParts.join(' ').replace(/\s+/g, ' ').trim(),
                type: 'return-processed',
                transactionId: transaction.id || transaction._id,
                recipients: borrowerRecipients,
                meta: {
                    transactionId: transaction.id || transaction._id,
                    borrowerName,
                    returnedItems,
                    fineAmount: totalFine,
                    hasOutstandingItems,
                    returnDate: returnDate.toISOString(),
                    daysOverdue,
                    processedBy: actorId,
                    processedByName: actorName || undefined
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                readBy: []
            });
        } catch (notifyError) {
            console.error('Failed to notify borrower about return processing:', notifyError);
        }
    }

    return {
        returnedItems,
        fineAmount: totalFine,
        daysOverdue
    };
};

router.get('/', verifyToken, requireCirculation, async(req, res) => {
    try {
        const { page = 1, limit = 20, status, userId, type, startDate, endDate, search } = req.query;
        const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
        const limitNumber = Math.max(parseInt(limit, 10) || 20, 1);
        const normalizedStatusFilter = typeof status === 'string' ? status.trim().toLowerCase() : '';
        const normalizedTypeFilter = typeof type === 'string' ? type.trim().toLowerCase() : '';

        const derivedStatusFilters = new Set(['active', 'overdue', 'requested', 'pending']);
        const filters = {};
        if (userId) filters.userId = userId;
        if (normalizedStatusFilter && !derivedStatusFilters.has(normalizedStatusFilter)) {
            filters.status = normalizedStatusFilter;
        }
        if (normalizedTypeFilter && normalizedTypeFilter !== 'annual') {
            filters.type = normalizedTypeFilter;
        }

        let transactions = await req.dbAdapter.findInCollection('transactions', filters);

        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            transactions = transactions.filter(transaction => {
                const transactionDate = new Date(transaction.createdAt || transaction.borrowDate || Date.now());
                if (start && transactionDate < start) return false;
                if (end && transactionDate > end) return false;
                return true;
            });
        }

        if (normalizedStatusFilter && normalizedStatusFilter !== 'all') {
            const nowMs = Date.now();
            transactions = transactions.filter(transaction => matchesStatusFilter(transaction, normalizedStatusFilter, nowMs));
        }

        if (normalizedTypeFilter && normalizedTypeFilter !== 'all') {
            transactions = transactions.filter(transaction => matchesTypeFilter(transaction, normalizedTypeFilter));
        }

        transactions.sort((a, b) => new Date(b.createdAt || b.borrowDate) - new Date(a.createdAt || a.borrowDate));

        const allUsers = await req.dbAdapter.findInCollection('users', {});
        const allBooks = await req.dbAdapter.findInCollection('books', {});
        const usersLookup = buildLookupMap(allUsers, user => [user.id, user._id, user.uid, user.userId, user.libraryCardNumber]);
        const booksLookup = buildLookupMap(allBooks, book => [book.id, book._id, book.bookId, book.isbn]);
        const copiesLookup = new Map();
        allBooks.forEach(book => {
            (book.copies || []).forEach(copy => {
                if (copy.copyId) {
                    copiesLookup.set(String(copy.copyId), book);
                }
            });
        });

        let detailedTransactions = [];

        transactions.forEach(transaction => {
            const borrower = usersLookup.get(String(transaction.userId)) || null;
            const borrowerName = getBorrowerName(borrower);
            const borrowerEmail = (borrower?.email) || (borrower?.username) || '';
            const documentId = transaction._id || transaction.id;
            const baseRecord = {
                ...transaction,
                documentId,
                id: transaction.id || transaction._id || documentId,
                status: normalizeStatus(transaction.status),
                borrowerName,
                borrowerEmail,
                borrowerId: transaction.userId,
                fine: transaction.fineAmount || transaction.fine || 0
            };

            if (transaction.items && transaction.items.length > 0) {
                transaction.items.forEach((item, index) => {
                    const book = booksLookup.get(String(item.bookId)) || copiesLookup.get(String(item.copyId)) || null;
                    const bookTitle = (book?.title) || item.title || item.isbn || 'Unknown Book';
                    const author = (book?.author) || (book?.publisher) || '';
                    const rowId = `${documentId || baseRecord.id || 'transaction'}_${item.copyId || index}`;
                    detailedTransactions.push({
                        ...baseRecord,
                        _id: rowId,
                        copyId: item.copyId || '',
                        bookTitle,
                        author
                    });
                });
            } else {
                detailedTransactions.push({
                    ...baseRecord,
                    _id: documentId || baseRecord.id,
                    copyId: '',
                    bookTitle: 'Unknown Book',
                    author: ''
                });
            }
        });

        if (search) {
            const searchValue = String(search).toLowerCase();
            detailedTransactions = detailedTransactions.filter(transaction => {
                const idMatches = [
                    transaction.transactionId,
                    transaction.documentId,
                    transaction.id,
                    transaction._id
                ]
                    .map(value => (value ? String(value).toLowerCase() : ''))
                    .some(value => value.includes(searchValue));
                return (
                    idMatches ||
                    transaction.bookTitle?.toLowerCase().includes(searchValue) ||
                    transaction.author?.toLowerCase().includes(searchValue) ||
                    transaction.borrowerName?.toLowerCase().includes(searchValue) ||
                    transaction.borrowerEmail?.toLowerCase().includes(searchValue) ||
                    transaction.copyId?.toLowerCase().includes(searchValue)
                );
            });
        }

        const total = detailedTransactions.length;
        const startIndex = (pageNumber - 1) * limitNumber;
        const paginatedTransactions = detailedTransactions.slice(startIndex, startIndex + limitNumber);

        res.json({
            transactions: paginatedTransactions,
            pagination: {
                page: pageNumber,
                limit: limitNumber,
                total,
                pages: Math.ceil(total / limitNumber)
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ message: 'Failed to fetch transactions' });
    }
});

// Transaction stats (MUST be before /:id)
router.get('/stats', verifyToken, requireCirculation, async(req, res) => {
    try {
        const transactions = await req.dbAdapter.findInCollection('transactions', {});
        const borrowedCount = transactions.filter(t => (t.status === 'borrowed' || t.status === 'active')).length;
        const stats = {
            total: transactions.length,
            borrowed: borrowedCount,
            returned: transactions.filter(t => t.status === 'returned').length,
            overdue: transactions.filter(t => (t.status === 'borrowed' || t.status === 'active') && new Date(t.dueDate) < new Date()).length
        };
        res.json(stats);
    } catch (error) {
        console.error('Get transaction stats error:', error);
        res.status(500).json({ message: 'Failed to fetch transaction stats' });
    }
});

// Annual borrowing stats (MUST be before /:id)
router.get('/annual/stats', verifyToken, requireCirculation, async(req, res) => {
    try {
        const { year } = req.query;
        const targetYear = year || new Date().getFullYear();
        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        const annualTransactions = transactions.filter(t => {
            const tDate = new Date(t.borrowDate || t.createdAt);
            return tDate.getFullYear() === parseInt(targetYear);
        });

        res.json({
            year: targetYear,
            total: annualTransactions.length,
            byMonth: Array.from({ length: 12 }, (_, i) => {
                const month = i + 1;
                return {
                    month,
                    count: annualTransactions.filter(t => new Date(t.borrowDate || t.createdAt).getMonth() + 1 === month).length
                };
            })
        });
    } catch (error) {
        console.error('Get annual stats error:', error);
        res.status(500).json({ message: 'Failed to fetch annual stats' });
    }
});

// Annual borrowing list (MUST be before /:id)
router.get('/annual', verifyToken, requireCirculation, async(req, res) => {
    try {
    const { year, curriculum } = req.query;
        const targetYear = year || new Date().getFullYear();
        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        let annualTransactions = transactions.filter(t => {
            const tDate = new Date(t.borrowDate || t.createdAt);
            return tDate.getFullYear() === parseInt(targetYear);
        });

        if (curriculum) {
            // Filter by curriculum if provided (would need user data)
            const users = await req.dbAdapter.findInCollection('users', { curriculum });
            const userIds = users.map(u => u.id);
            annualTransactions = annualTransactions.filter(t => userIds.includes(t.userId));
        }

        res.json(annualTransactions);
    } catch (error) {
        console.error('Get annual transactions error:', error);
        res.status(500).json({ message: 'Failed to fetch annual transactions' });
    }
});

// Overdue list (MUST be before /:id)
router.get('/overdue/list', verifyToken, requireCirculation, async(req, res) => {
    try {
        const currentDate = new Date();
        const transactions = await req.dbAdapter.findInCollection('transactions', { status: 'borrowed' });
        const overdueTransactions = transactions
            .filter(transaction => transaction.dueDate)
            .filter(transaction => new Date(transaction.dueDate) < currentDate)
            .map(transaction => {
                const due = new Date(transaction.dueDate);
                const daysOverdue = Math.ceil((currentDate - due) / (1000 * 60 * 60 * 24));
                return { ...transaction, daysOverdue };
            });
        res.json(overdueTransactions);
    } catch (error) {
        console.error('Get overdue transactions error:', error);
        res.status(500).json({ message: 'Failed to fetch overdue transactions' });
    }
});

// User transactions (MUST be before /:id)
router.get('/user/:userId', verifyToken, async(req, res) => {
    try {
        let transactions = await req.dbAdapter.findInCollection('transactions', { userId: req.params.userId });
        transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const enriched = await enrichTransactionsWithBookMetadata(transactions, req.dbAdapter);
        res.json(enriched);
    } catch (error) {
        console.error('Get user transactions error:', error);
        res.status(500).json({ message: 'Failed to fetch user transactions' });
    }
});

router.get('/borrowed', verifyToken, requireCirculation, async(req, res) => {
    try {
        const searchTerm = (req.query.search || '').trim().toLowerCase();
        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        const activeTransactions = transactions.filter(transaction => {
            const status = normalizeStatus(transaction.status);
            if (!ACTIVE_TRANSACTION_STATUSES.has(status)) return false;
            return (transaction.items || []).some(item => item && item.copyId && item.status !== 'returned');
        });

        if (activeTransactions.length === 0) {
            return res.json([]);
        }

        const { usersLookup, booksLookup, copiesLookup } = await loadBorrowingLookups(req.dbAdapter);

        const records = [];

        activeTransactions.forEach(transaction => {
            (transaction.items || []).forEach(item => {
                if (!item || !item.copyId || item.status === 'returned') {
                    return;
                }
                const record = buildBorrowedRecord({
                    transaction,
                    item,
                    lookups: { usersLookup, booksLookup, copiesLookup }
                });

                if (!searchTerm) {
                    records.push(record);
                    return;
                }

                const haystacks = [
                    record.bookTitle,
                    record.author,
                    record.borrowerName,
                    record.borrowerEmail,
                    record.copyId,
                    record.transactionId
                ].filter(Boolean).map(value => String(value).toLowerCase());

                if (haystacks.some(value => value.includes(searchTerm))) {
                    records.push(record);
                }
            });
        });

        res.json(records);
    } catch (error) {
        console.error('Borrowed lookup error:', error);
        res.status(500).json({ message: 'Failed to search borrowed transactions' });
    }
});

router.get('/by-copy', verifyToken, requireCirculation, async(req, res) => {
    try {
        const copyId = (req.query.copyId || '').trim();
        if (!copyId) {
            return res.status(400).json({ message: 'copyId query parameter is required' });
        }

        const transactions = await req.dbAdapter.findInCollection('transactions', {});

        for (const transaction of transactions) {
            const status = normalizeStatus(transaction.status);
            if (!ACTIVE_TRANSACTION_STATUSES.has(status)) {
                continue;
            }

            for (const item of transaction.items || []) {
                if (!item || item.status === 'returned') {
                    continue;
                }
                if (String(item.copyId) === copyId) {
                    const { usersLookup, booksLookup, copiesLookup } = await loadBorrowingLookups(req.dbAdapter);
                    const record = buildBorrowedRecord({
                        transaction,
                        item,
                        lookups: { usersLookup, booksLookup, copiesLookup }
                    });
                    return res.json(record);
                }
            }
        }

        res.status(404).json({ message: 'No borrowed record found for this copy' });
    } catch (error) {
        console.error('Borrowed lookup by copy error:', error);
        res.status(500).json({ message: 'Failed to search copy borrowing record' });
    }
});

// Transaction history (audit logs) - returns audit entries related to this transaction
router.get('/:id/history', verifyToken, async(req, res) => {
    try {
        const transactionId = req.params.id;

        // Fetch audit logs and filter for any entry that references this transaction id
        // Look into entityId, resourceId, details, and metadata for references
        let logs = await req.dbAdapter.findInCollection('audit', {});

        const matches = logs.filter(log => {
            try {
                const entityMatch = log.entityId && String(log.entityId) === String(transactionId);
                const resourceMatch = log.resourceId && String(log.resourceId) === String(transactionId);
                const detailsString = JSON.stringify(log.details || {});
                const metadataString = JSON.stringify(log.metadata || {});
                const inDetails = detailsString.includes(transactionId);
                const inMetadata = metadataString.includes(transactionId);
                const actionEntityMatch = log.entity && String(log.entity).toLowerCase() === 'transaction' && (entityMatch || resourceMatch);

                return entityMatch || resourceMatch || inDetails || inMetadata || actionEntityMatch;
            } catch (e) {
                return false;
            }
        });

        // Sort by timestamp desc
        matches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(matches);
    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ message: 'Failed to fetch transaction history' });
    }
});

router.get('/:id', verifyToken, async(req, res) => {
    try {
        const transaction = await findTransactionByIdentifier(req.dbAdapter, req.params.id);
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
        const user = await req.dbAdapter.findOneInCollection('users', { id: transaction.userId });
        if (user) transaction.user = user;
        for (let item of transaction.items) {
            const book = await req.dbAdapter.findOneInCollection('books', { id: item.bookId });
            if (book) item.book = book;
        }
        res.json(transaction);
    } catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({ message: 'Failed to fetch transaction' });
    }
});

// Transaction history (audit logs) - returns audit entries related to this transaction
router.get('/:id/history', verifyToken, async(req, res) => {
    try {
        const transactionId = req.params.id;

        // Fetch audit logs and filter for any entry that references this transaction id
        // Look into entityId, resourceId, details, and metadata for references
        let logs = await req.dbAdapter.findInCollection('audit', {});

        const matches = logs.filter(log => {
            try {
                const entityMatch = log.entityId && String(log.entityId) === String(transactionId);
                const resourceMatch = log.resourceId && String(log.resourceId) === String(transactionId);
                const detailsString = JSON.stringify(log.details || {});
                const metadataString = JSON.stringify(log.metadata || {});
                const inDetails = detailsString.includes(transactionId);
                const inMetadata = metadataString.includes(transactionId);
                const actionEntityMatch = log.entity && String(log.entity).toLowerCase() === 'transaction' && (entityMatch || resourceMatch);

                return entityMatch || resourceMatch || inDetails || inMetadata || actionEntityMatch;
            } catch (e) {
                return false;
            }
        });

        // Sort by timestamp desc
        matches.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(matches);
    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ message: 'Failed to fetch transaction history' });
    }
});

router.post('/borrow', verifyToken, requireCirculation, logAction('BORROW', 'transaction'), async(req, res) => {
    try {
        const { userId, items, type = 'regular', notes } = req.body;
        const transactionType = normalizeTransactionType(type);
        const requestedItems = Array.isArray(items) ? items : [];

        setAuditContext(req, {
            details: {
                borrowerId: userId || null
            },
            metadata: {
                borrowRequest: {
                    type: transactionType,
                    itemCount: requestedItems.length,
                    copyIds: requestedItems
                        .map(item => item && item.copyId)
                        .filter(Boolean)
                }
            }
        });

        if (!userId || !Array.isArray(items) || items.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Borrow request missing userId or items'
            });
            return res.status(400).json({ message: 'User ID and items are required' });
        }
        const borrowingSettings = await getBorrowingSettings(req);
        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);
        if (isOvernightType(transactionType) && borrowingSettings.overnightBorrowingEnabled === false) {
            setAuditContext(req, {
                success: false,
                status: 'OvernightDisabled',
                description: 'Borrow request blocked: overnight borrowing disabled'
            });
            return res.status(403).json({ message: 'Overnight borrowing is currently disabled' });
        }
        if (isAnnualType(transactionType) && borrowingSettings.annualBorrowingEnabled === false) {
            setAuditContext(req, {
                success: false,
                status: 'AnnualDisabled',
                description: 'Borrow request blocked: annual borrowing disabled'
            });
            return res.status(403).json({ message: 'Annual borrowing is currently disabled' });
        }

        // Check school year for annual borrowing
        if (isAnnualType(transactionType)) {
            const systemSettings = req.systemSettings;
            const schoolYearStart = new Date(systemSettings.schoolYearStart);
            const schoolYearEnd = new Date(systemSettings.schoolYearEnd);
            const now = new Date();
            if (now < schoolYearStart || now > schoolYearEnd) {
                setAuditContext(req, {
                    success: false,
                    status: 'OutsideSchoolYear',
                    description: 'Borrow request blocked: outside school year for annual borrowing'
                });
                return res.status(403).json({ message: 'Annual borrowing is only allowed during the school year' });
            }
        }

        const maxBooksPerTransaction = Number(borrowingSettings.maxBooksPerTransaction) || 0;
        if (maxBooksPerTransaction > 0 && items.length > maxBooksPerTransaction) {
            setAuditContext(req, {
                success: false,
                status: 'LimitExceeded',
                description: `Borrow request exceeds maximum ${maxBooksPerTransaction} books per transaction`,
                metadata: {
                    attemptedCount: items.length,
                    maxBooksPerTransaction
                }
            });
            return res.status(400).json({ message: `Maximum ${maxBooksPerTransaction} books per transaction` });
        }
        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, {
                success: false,
                status: 'UserNotFound',
                description: `Borrow request failed: user ${userId} not found`,
                entityId: userId,
                metadata: {
                    userId
                }
            });
            return res.status(404).json({ message: 'User not found' });
        }
        if (!user.isActive) {
            setAuditContext(req, {
                success: false,
                status: 'UserInactive',
                description: `Borrow request failed: user ${userId} is not active`,
                entityId: userId
            });
            return res.status(400).json({ message: 'User account is not active' });
        }
        const transactionItems = [];
        const borrowDate = new Date();
        const borrowWindowDays = resolveBorrowWindowDays(transactionType, borrowingSettings);
        const dueDate = calculateDueDate(borrowDate, borrowWindowDays);
        for (const item of items) {
            const { copyId } = item;
            const allBooks = await req.dbAdapter.findInCollection('books', {});
            let targetBook = null;
            let targetCopy = null;
            for (const book of allBooks) {
                const copy = book.copies?.find(c => c.copyId === copyId);
                if (copy) {
                    targetBook = book;
                    targetCopy = copy;
                    break;
                }
            }
            if (!targetBook || !targetCopy) {
                setAuditContext(req, {
                    success: false,
                    status: 'CopyNotFound',
                    description: `Borrow request failed: book copy ${copyId} not found`,
                    metadata: {
                        copyId
                    }
                });
                return res.status(404).json({ message: `Book copy ${copyId} not found` });
            }
            if (targetCopy.status !== 'available') {
                setAuditContext(req, {
                    success: false,
                    status: 'CopyUnavailable',
                    description: `Borrow request failed: book copy ${copyId} is not available`,
                    metadata: {
                        copyId,
                        copyStatus: targetCopy.status
                    }
                });
                return res.status(400).json({ message: `Book copy ${copyId} is not available` });
            }
            const updatedCopies = targetBook.copies.map(c => c.copyId === copyId ? {...c, status: 'borrowed', updatedAt: new Date() } : c);
            const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
            await req.dbAdapter.updateInCollection('books', { id: targetBook.id }, { copies: updatedCopies, availableCopies, updatedAt: new Date() });
            await maybeNotifyLowInventory(req.dbAdapter, {
                ...targetBook,
                copies: updatedCopies,
                availableCopies
            }, { source: 'transaction-borrow' });
            transactionItems.push({ copyId, bookId: targetBook.id, isbn: targetBook.isbn, status: 'borrowed' });
        }
    const transactionId = generateTransactionId('borrow');
        const transactionData = { id: transactionId, userId, items: transactionItems, type: transactionType, status: 'borrowed', borrowDate, dueDate, returnDate: null, fineAmount: 0, notes: notes || '', renewalCount: 0, createdAt: new Date(), updatedAt: new Date(), createdBy: req.user.id, metadata: { borrowWindowDays } };
        await req.dbAdapter.insertIntoCollection('transactions', transactionData);
        const userBorrowingStats = user.borrowingStats || { totalBorrowed: 0, currentlyBorrowed: 0, totalFines: 0 };
        await req.dbAdapter.updateInCollection('users', { id: userId }, { borrowingStats: { totalBorrowed: (userBorrowingStats.totalBorrowed || 0) + items.length, currentlyBorrowed: (userBorrowingStats.currentlyBorrowed || 0) + items.length, totalFines: userBorrowingStats.totalFines || 0 }, updatedAt: new Date() });

        const borrowerRecipients = buildRecipientList(user.id, user._id, user.userId, user.libraryCardNumber, user.email, user.username);
        if (channelState.hasActiveChannel && borrowerRecipients.length > 0) {
            try {
                await req.dbAdapter.insertIntoCollection('notifications', {
                    title: 'Borrow transaction created',
                    message: `Your borrow transaction ${transactionId} has been recorded. Please return items on time.`,
                    type: 'borrow-created',
                    transactionId,
                    recipients: borrowerRecipients,
                    meta: {
                        transactionId,
                        itemCount: transactionItems.length,
                        status: 'borrowed'
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    readBy: []
                });
            } catch (notifyError) {
                console.error('Failed to notify borrower about request submission:', notifyError);
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            entityId: transactionId,
            resourceId: transactionId,
            description: `Borrowed ${transactionItems.length} item(s) for ${getBorrowerName(user)}`,
            details: {
                borrower: {
                    id: userId,
                    name: getBorrowerName(user),
                    email: user.email || ''
                },
                transaction: {
                    id: transactionId,
                    type: transactionType,
                    notes: notes || '',
                    dueDate: dueDate.toISOString(),
                    items: transactionItems.map(entry => ({
                        copyId: entry.copyId,
                        bookId: entry.bookId,
                        isbn: entry.isbn
                    }))
                }
            },
            metadata: {
                borrowDate: borrowDate.toISOString(),
                dueDate: dueDate.toISOString(),
                itemCount: transactionItems.length,
                actorId: req.user.id
            }
        });
        res.status(201).json({ message: 'Books borrowed successfully', transactionId, dueDate: dueDate.toISOString() });
    } catch (error) {
        console.error('Borrow books error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Borrow request failed: ${error.message}`,
            metadata: {
                errorName: error.name
            },
            details: {
                error: error.message
            }
        });
        res.status(500).json({ message: 'Failed to borrow books' });
    }
});

// Student borrow request (creates a 'requested' transaction that staff can approve)
router.post('/request', verifyToken, logAction('REQUEST', 'transaction'), async (req, res) => {
    try {
        const { userId: providedUserId, items, type = 'regular', notes } = req.body || {};
        // If caller didn't provide userId, default to authenticated user
        const userId = providedUserId || req.user && req.user.id;
        const borrowingSettings = await getBorrowingSettings(req);
        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);
        const transactionType = normalizeTransactionType(type);
        const requestItems = Array.isArray(items) ? items : [];

        setAuditContext(req, {
            metadata: {
                borrowRequest: {
                    type: transactionType,
                    itemCount: requestItems.length
                }
            },
            details: {
                requestedBy: req.user && req.user.id
            }
        });

        if (!userId || requestItems.length === 0) {
            setAuditContext(req, { success: false, status: 'ValidationError', description: 'Request missing userId or items' });
            return res.status(400).json({ message: 'User ID and items are required' });
        }

        const user = await req.dbAdapter.findUserById(userId);
        if (!user) {
            setAuditContext(req, { success: false, status: 'UserNotFound', description: `Request failed: user ${userId} not found`, entityId: userId });
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.isActive) {
            setAuditContext(req, { success: false, status: 'UserInactive', description: `Request failed: user ${userId} not active`, entityId: userId });
            return res.status(400).json({ message: 'User account is not active' });
        }

        // Check operating hours for student accounts
        const userRole = (user.role || '').toLowerCase();
        const isStudent = !['admin', 'librarian', 'staff'].includes(userRole);
        if (isStudent) {
            const librarySettings = await getLibrarySettings(req);
            if (!isWithinOperatingHours(librarySettings)) {
                setAuditContext(req, { success: false, status: 'OutsideOperatingHours', description: 'Request blocked: outside library operating hours' });
                return res.status(403).json({ message: 'Borrow requests are only allowed during library operating hours' });
            }
        }

        // Respect settings for max books per transaction if available but do not reserve copies here
        if (isOvernightType(transactionType) && borrowingSettings.overnightBorrowingEnabled === false) {
            setAuditContext(req, { success: false, status: 'OvernightDisabled', description: 'Request blocked: overnight borrowing disabled' });
            return res.status(403).json({ message: 'Overnight borrowing is currently disabled' });
        }
        if (isAnnualType(transactionType) && borrowingSettings.annualBorrowingEnabled === false) {
            setAuditContext(req, { success: false, status: 'AnnualDisabled', description: 'Request blocked: annual borrowing disabled' });
            return res.status(403).json({ message: 'Annual borrowing is currently disabled' });
        }

        // Check school year for annual borrowing
        if (isAnnualType(transactionType)) {
            const systemSettings = req.systemSettings;
            const schoolYearStart = new Date(systemSettings.schoolYearStart);
            const schoolYearEnd = new Date(systemSettings.schoolYearEnd);
            const now = new Date();
            if (now < schoolYearStart || now > schoolYearEnd) {
                setAuditContext(req, {
                    success: false,
                    status: 'OutsideSchoolYear',
                    description: 'Request blocked: outside school year for annual borrowing'
                });
                return res.status(403).json({ message: 'Annual borrowing is only allowed during the school year' });
            }
        }

        const parsedMaxBooks = parseInt(borrowingSettings.maxBooksPerTransaction, 10);
        const maxBooksPerTransaction = Number.isFinite(parsedMaxBooks) && parsedMaxBooks > 0 ? parsedMaxBooks : 0;
        if (maxBooksPerTransaction > 0 && requestItems.length > maxBooksPerTransaction) {
            setAuditContext(req, { success: false, status: 'LimitExceeded', description: `Request exceeds maximum ${maxBooksPerTransaction} books per transaction` });
            return res.status(400).json({ message: `Maximum ${maxBooksPerTransaction} books per transaction` });
        }

        const transactionId = generateTransactionId('request');
        const transactionItems = requestItems.map((item, index) => {
            if (typeof item === 'string') {
                return {
                    requestItemId: `${transactionId}_item_${index + 1}`,
                    copyId: item,
                    bookId: '',
                    status: 'requested'
                };
            }

            const copyId = item && item.copyId ? normalizeIdValue(item.copyId) : '';
            const bookId = item && item.bookId ? normalizeIdValue(item.bookId) : '';

            return {
                requestItemId: `${transactionId}_item_${index + 1}`,
                copyId,
                bookId,
                status: 'requested'
            };
        });

        const invalidItems = transactionItems.filter(entry => !entry.copyId && !entry.bookId);
        if (invalidItems.length > 0) {
            setAuditContext(req, { success: false, status: 'ValidationError', description: 'Each requested item must reference a book copy or book ID' });
            return res.status(400).json({ message: 'Each requested item must reference a book copy or book ID' });
        }
        const now = new Date();
        const transactionData = {
            id: transactionId,
            userId,
            items: transactionItems,
            type: transactionType,
            status: 'requested',
            createdAt: now,
            updatedAt: now,
            createdBy: req.user && req.user.id,
            notes: notes || ''
        };

        await req.dbAdapter.insertIntoCollection('transactions', transactionData);

        const borrowerRecipients = buildRecipientList(
            user.id,
            user._id,
            user.userId,
            user.libraryCardNumber,
            user.email,
            user.username
        );

        if (
            notificationSettings.reservationNotifications !== false &&
            channelState.hasActiveChannel &&
            borrowerRecipients.length > 0
        ) {
            try {
                await req.dbAdapter.insertIntoCollection('notifications', {
                    title: 'Borrow request submitted',
                    message: `We received your borrow request ${transactionId}. A librarian will review it shortly.`,
                    type: 'request-submitted',
                    transactionId,
                    recipients: borrowerRecipients,
                    meta: {
                        transactionId,
                        itemCount: transactionItems.length,
                        status: 'requested'
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    readBy: []
                });
            } catch (notifyError) {
                console.error('Failed to notify borrower about request submission:', notifyError);
            }
        }

        // Create a persistent notification for staff about this request
        if (notificationSettings.reservationNotifications !== false && channelState.hasActiveChannel) {
            const staffRequestMessage = buildBorrowRequestStaffMessage({
                borrowerName: getBorrowerName(user),
                transactionId,
                transactionType,
                itemCount: transactionItems.length,
                notes: notes || ''
            });
            const requestNotePreview = buildNotePreview(notes);
            try {
                await req.dbAdapter.insertIntoCollection('notifications', {
                    title: 'New borrow request',
                    message: staffRequestMessage,
                    type: 'request',
                    transactionId,
                    recipients: ['staff','librarian','admin'],
                    meta: {
                        transactionId,
                        itemCount: transactionItems.length,
                        borrowerName: getBorrowerName(user),
                        requestType: transactionType,
                        notesPreview: requestNotePreview
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    readBy: []
                });
            } catch (nerr) {
                console.error('Failed to create persistent notification for request:', nerr);
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Created',
            entityId: transactionId,
            resourceId: transactionId,
            description: `Created borrow request (${transactionId}) for user ${userId}`,
            metadata: {
                requestId: transactionId,
                itemCount: transactionItems.length,
                actorId: req.user && req.user.id
            }
        });

        res.status(201).json({ message: 'Borrow request created', transactionId, transaction: transactionData });
    } catch (error) {
        console.error('Create request error:', error);
        setAuditContext(req, { success: false, status: 'Error', description: `Request creation failed: ${error.message}`, details: { error: error.message } });
        res.status(500).json({ message: 'Failed to create borrow request' });
    }
});

router.post('/cancel/:id', verifyToken, logAction('CANCEL', 'transaction'), async (req, res) => {
    try {
        const txnIdentifier = req.params.id;
        const reason = req.body && typeof req.body === 'object' ? req.body.reason : '';

        setAuditContext(req, {
            details: {
                transactionId: txnIdentifier,
                reason: reason || undefined
            },
            metadata: {
                cancelRequest: {
                    transactionId: txnIdentifier,
                    actorId: req.user && req.user.id || null
                }
            }
        });

        const transaction = await findTransactionByIdentifier(req.dbAdapter, txnIdentifier);
        if (!transaction) {
            setAuditContext(req, {
                success: false,
                status: 'TransactionNotFound',
                description: `Cancel request failed: transaction ${txnIdentifier} not found`,
                entityId: txnIdentifier
            });
            return res.status(404).json({ message: 'Transaction not found' });
        }

        const transactionOwnerId = normalizeIdValue(transaction.userId || transaction.user?._id || transaction.user?.id);
        const requesterIds = [
            normalizeIdValue(req.user && req.user.id),
            normalizeIdValue(req.user && req.user._id),
            normalizeIdValue(req.user && req.user.userId)
        ].filter(Boolean);

        const privilegedRoles = new Set(['admin', 'librarian', 'staff']);
        const actorRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : '';
        const hasOwnership = transactionOwnerId && requesterIds.some(id => id === transactionOwnerId);
        const isPrivileged = privilegedRoles.has(actorRole);

        if (!hasOwnership && !isPrivileged) {
            setAuditContext(req, {
                success: false,
                status: 'Forbidden',
                description: `Cancel request failed: user ${req.user && req.user.id} is not authorized`,
                entityId: transaction.id || transaction._id
            });
            return res.status(403).json({ message: 'You are not allowed to cancel this request' });
        }

        const cancellableStatuses = new Set(['requested', 'pending']);
        if (!cancellableStatuses.has(String(transaction.status || '').toLowerCase())) {
            setAuditContext(req, {
                success: false,
                status: 'InvalidStatus',
                description: `Cancel request failed: transaction ${transaction.id || transaction._id} is not pending`,
                entityId: transaction.id || transaction._id,
                metadata: {
                    currentStatus: transaction.status || null
                }
            });
            return res.status(400).json({ message: 'Only pending requests can be cancelled' });
        }

        const notificationSettings = await getNotificationSettings(req);
        const sendCancellationAlerts = notificationSettings.reservationNotifications !== false;
        let borrowerUser = null;
        let borrowerRecipients = [];
        let borrowerName = 'Borrower';
        const actorName = getBorrowerName(req.user);

        if (sendCancellationAlerts) {
            borrowerUser = await findUserByAnyIdentifier(req.dbAdapter, transaction.userId) || transaction.user || null;
            borrowerRecipients = borrowerUser
                ? buildRecipientList(
                    borrowerUser.id,
                    borrowerUser._id,
                    borrowerUser.userId,
                    borrowerUser.libraryCardNumber,
                    borrowerUser.email,
                    borrowerUser.username
                )
                : buildRecipientList(transaction.userId);
            borrowerName = borrowerUser ? getBorrowerName(borrowerUser) : borrowerName;
        }

        const updatePayload = {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: req.user && req.user.id,
            cancelReason: reason || '',
            updatedAt: new Date()
        };

        const txQuery = transaction.id ? { id: transaction.id } : { _id: transaction._id };
        const updatedTransaction = await req.dbAdapter.updateInCollection('transactions', txQuery, updatePayload);
        const responseTransaction = (updatedTransaction && typeof updatedTransaction === 'object')
            ? updatedTransaction
            : { ...transaction, ...updatePayload };

        try {
            const notifications = await req.dbAdapter.findInCollection('notifications', { transactionId: transaction.id || transaction._id });
            for (const notification of notifications) {
                const notificationQuery = notification.id ? { id: notification.id } : { _id: notification._id };
                await req.dbAdapter.updateInCollection('notifications', notificationQuery, {
                    archived: true,
                    updatedAt: new Date(),
                    readBy: Array.from(new Set([...(notification.readBy || []), req.user && req.user.id].filter(Boolean)))
                });
            }
        } catch (notifyError) {
            console.error('Failed to mark notifications after cancel:', notifyError);
        }

        if (sendCancellationAlerts) {
            try {
                const reasonSuffix = reason ? ` Reason: ${reason}` : '';
                if (borrowerRecipients.length > 0) {
                    await notifyRecipients(req, borrowerRecipients, {
                        title: 'Borrow request cancelled',
                        message: `Your borrow request ${transaction.id || transaction._id} was cancelled.${reasonSuffix}`,
                        type: 'request-cancelled',
                        severity: 'info',
                        transactionId: transaction.id || transaction._id,
                        meta: {
                            transactionId: transaction.id || transaction._id,
                            cancelledBy: req.user && req.user.id,
                            reason: reason || ''
                        }
                    });
                }

                await notifyRoles(req, ['staff', 'librarian', 'admin'], {
                    title: 'Borrow request cancelled',
                    message: `${borrowerName} cancelled request ${transaction.id || transaction._id}. ${actorName ? `Handled by ${actorName}.` : ''}${reason ? ` Reason: ${reason}.` : ''}`.trim(),
                    type: 'request-cancelled-alert',
                    severity: 'low',
                    transactionId: transaction.id || transaction._id,
                    meta: {
                        transactionId: transaction.id || transaction._id,
                        actorId: req.user && req.user.id,
                        borrowerId: transaction.userId,
                        reason: reason || ''
                    }
                });
            } catch (notificationError) {
                console.error('Failed to send cancellation notifications:', notificationError);
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Cancelled',
            description: `Cancelled borrow request ${transaction.id || transaction._id}`,
            entityId: transaction.id || transaction._id,
            resourceId: transaction.id || transaction._id,
            metadata: {
                actorId: req.user && req.user.id,
                reason: reason || '',
                previousStatus: transaction.status || null
            }
        });

        res.json({
            message: 'Borrow request cancelled',
            transactionId: transaction.id || transaction._id,
            transaction: responseTransaction
        });
    } catch (error) {
        console.error('Cancel request error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Cancel failed: ${error.message}`,
            details: { error: error.message }
        });
        res.status(500).json({ message: 'Failed to cancel borrow request' });
    }
});

// Approve a borrow request (staff only) - converts 'requested' -> 'borrowed' and reserves copies
router.post('/approve/:id', verifyToken, requireCirculation, logAction('APPROVE', 'transaction'), async (req, res) => {
    try {
        const txnIdentifier = req.params.id;
        const transaction = await findTransactionByIdentifier(req.dbAdapter, txnIdentifier);
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        if (transaction.status !== 'requested') {
            return res.status(400).json({ message: 'Only requested transactions can be approved' });
        }

        const approverName = getBorrowerName(req.user);

        const items = Array.isArray(transaction.items)
            ? transaction.items.map(item => ({
                ...item,
                copyId: normalizeIdValue(item.copyId),
                bookId: normalizeIdValue(item.bookId),
                requestItemId: normalizeIdValue(item.requestItemId)
            }))
            : [];
        if (items.length === 0) {
            return res.status(400).json({ message: 'Requested transaction has no items' });
        }

        const bodyPayload = req.body && typeof req.body === 'object' ? req.body : {};
        const assignmentPayload = Array.isArray(bodyPayload.items)
            ? bodyPayload.items
            : Array.isArray(bodyPayload.assignments)
                ? bodyPayload.assignments
                : [];

        const normalizedAssignments = assignmentPayload
            .map(entry => ({
                copyId: normalizeIdValue(entry && entry.copyId),
                bookId: normalizeIdValue(entry && entry.bookId),
                requestItemId: normalizeIdValue(entry && entry.requestItemId)
            }))
            .filter(entry => Boolean(entry.copyId));

        if (normalizedAssignments.length > 0) {
            const { mergedItems, missingAssignments } = mergeRequestAssignments(items, normalizedAssignments);
            if (missingAssignments.length > 0) {
                setAuditContext(req, {
                    success: false,
                    status: 'ValidationFailed',
                    description: 'Missing copy assignments for one or more request items',
                    details: { missingAssignments }
                });
                return res.status(400).json({ message: 'Missing copy assignments for requested items', details: missingAssignments });
            }
            items.length = 0;
            mergedItems.forEach(entry => items.push({
                ...entry,
                copyId: normalizeIdValue(entry.copyId),
                bookId: normalizeIdValue(entry.bookId),
                requestItemId: normalizeIdValue(entry.requestItemId)
            }));
        }

        const allBooks = await req.dbAdapter.findInCollection('books', {});

        const copyLookup = new Map();
        allBooks.forEach(book => {
            (book.copies || []).forEach(copy => {
                const trackedCopyId = normalizeIdValue(copy.copyId);
                if (trackedCopyId) {
                    copyLookup.set(trackedCopyId, { book, copy });
                }
            });
        });

        const normalizeLower = (value) => {
            const normalized = normalizeIdValue(value);
            return normalized ? normalized.toLowerCase() : '';
        };

        const duplicateCopyAssignments = [];
        const missingCopyAssignments = [];
        const copyTracker = new Set();

        items.forEach((item, idx) => {
            const normalizedCopyId = normalizeIdValue(item.copyId);
            if (!normalizedCopyId) {
                missingCopyAssignments.push({
                    index: idx,
                    reason: 'missing-copyId',
                    requestItemId: item.requestItemId || null,
                    bookId: normalizeIdValue(item.bookId) || null
                });
                return;
            }

            const copyKey = normalizedCopyId.toLowerCase();
            if (copyTracker.has(copyKey)) {
                duplicateCopyAssignments.push({
                    index: idx,
                    copyId: normalizedCopyId,
                    requestItemId: item.requestItemId || null
                });
                return;
            }

            copyTracker.add(copyKey);
            item.copyId = normalizedCopyId;
            item.bookId = normalizeIdValue(item.bookId);
        });

        if (missingCopyAssignments.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationFailed',
                description: 'Copy assignments are required for each requested item',
                details: { missingCopyAssignments }
            });
            return res.status(400).json({ message: 'Copy assignments are required for each requested item', details: missingCopyAssignments });
        }

        if (duplicateCopyAssignments.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationFailed',
                description: 'Invalid or duplicate copy assignments provided',
                details: { duplicateCopyAssignments }
            });
            return res.status(400).json({ message: 'Invalid or duplicate copy assignments provided', details: duplicateCopyAssignments });
        }

        // First: validate all requested items exist and are available. Do not modify DB during validation.
        const validationFailures = [];
        const readyToUpdate = []; // { targetBook, targetCopy, copyId }

        for (const item of items) {
            const copyId = item.copyId;
            if (!copyId) {
                validationFailures.push({ item, reason: 'missing-copyId' });
                continue;
            }

            let targetBook = null;
            let targetCopy = null;

            const lookupEntry = copyLookup.get(normalizeIdValue(copyId));
            if (lookupEntry) {
                targetBook = lookupEntry.book;
                targetCopy = lookupEntry.copy;
            } else {
                for (const book of allBooks) {
                    const copy = (book.copies || []).find(c => String(c.copyId) === String(copyId));
                    if (copy) {
                        targetBook = book;
                        targetCopy = copy;
                        break;
                    }
                }
            }

            if (!targetBook || !targetCopy) {
                validationFailures.push({ item, reason: 'copy-not-found' });
                continue;
            }

            const canonicalBookId = normalizeIdValue(targetBook.id || targetBook._id || targetBook.bookId || targetBook.isbn);
            if (!item.bookId) {
                item.bookId = canonicalBookId;
            } else if (canonicalBookId && canonicalBookId !== normalizeIdValue(item.bookId)) {
                validationFailures.push({ item, reason: 'book-mismatch', expectedBookId: canonicalBookId });
                continue;
            }

            if (String(targetCopy.status).toLowerCase() !== 'available') {
                validationFailures.push({ item, reason: 'copy-unavailable', copyStatus: targetCopy.status });
                continue;
            }

            readyToUpdate.push({ targetBook, targetCopy, copyId });
        }

        // If any failures, return 400 and do not change DB state
        if (validationFailures.length > 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationFailed',
                description: 'Cannot approve request: one or more copies missing or unavailable',
                details: { validationFailures }
            });
            return res.status(400).json({ message: 'One or more requested copies are missing or unavailable', details: validationFailures });
        }

        // All validations passed — proceed to reserve copies and update books
        const updatedBooks = [];
        for (const ready of readyToUpdate) {
            const { targetBook, copyId } = ready;
            const updatedCopies = (targetBook.copies || []).map(c => c.copyId === copyId ? { ...c, status: 'borrowed', updatedAt: new Date(), updatedBy: req.user.id } : c);
            const bookQuery = targetBook.id ? { id: targetBook.id } : { _id: targetBook._id };
            const availableCopies = updatedCopies.filter(c => c.status === 'available').length;
            await req.dbAdapter.updateInCollection('books', bookQuery, { copies: updatedCopies, availableCopies, updatedAt: new Date() });
            await maybeNotifyLowInventory(req.dbAdapter, {
                ...targetBook,
                copies: updatedCopies,
                availableCopies
            }, { source: 'transaction-approve' });
            updatedBooks.push({ bookId: targetBook.id || targetBook._id, copyId });
        }

        const borrowingSettings = await getBorrowingSettings(req);
        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);
        const transactionType = normalizeTransactionType(transaction.type);
        if (isOvernightType(transactionType) && borrowingSettings.overnightBorrowingEnabled === false) {
            setAuditContext(req, {
                success: false,
                status: 'OvernightDisabled',
                description: 'Approve request blocked: overnight borrowing disabled'
            });
            return res.status(403).json({ message: 'Overnight borrowing is currently disabled' });
        }
        if (isAnnualType(transactionType) && borrowingSettings.annualBorrowingEnabled === false) {
            setAuditContext(req, {
                success: false,
                status: 'AnnualDisabled',
                description: 'Approve request blocked: annual borrowing disabled'
            });
            return res.status(403).json({ message: 'Annual borrowing is currently disabled' });
        }

        // Check school year for annual borrowing
        if (isAnnualType(transactionType)) {
            const systemSettings = req.systemSettings;
            const schoolYearStart = new Date(systemSettings.schoolYearStart);
            const schoolYearEnd = new Date(systemSettings.schoolYearEnd);
            const now = new Date();
            if (now < schoolYearStart || now > schoolYearEnd) {
                setAuditContext(req, {
                    success: false,
                    status: 'OutsideSchoolYear',
                    description: 'Approve request blocked: outside school year for annual borrowing'
                });
                return res.status(403).json({ message: 'Annual borrowing is only allowed during the school year' });
            }
        }

        const borrowWindowDays = resolveBorrowWindowDays(transactionType, borrowingSettings);
        const borrowDate = new Date();
        const dueDate = calculateDueDate(borrowDate, borrowWindowDays);
        
        // Calculate reservation expiration date
        const reservationPeriodDays = Number(borrowingSettings.reservationPeriodDays) || 3;
        const reservationExpiresAt = new Date(borrowDate);
        reservationExpiresAt.setDate(reservationExpiresAt.getDate() + reservationPeriodDays);

        // Update transaction
        const txQuery = transaction.id ? { id: transaction.id } : { _id: transaction._id };
        const updatedTransaction = await req.dbAdapter.updateInCollection('transactions', txQuery, {
            status: 'borrowed',
            borrowDate,
            dueDate,
            reservationExpiresAt,
            updatedAt: new Date(),
            updatedBy: req.user.id,
            items: items.map(it => ({ ...it, status: 'borrowed' }))
        });

        // Update user borrowing stats
        const borrowerLookupVariants = [
            { id: transaction.userId },
            { _id: transaction.userId },
            { userId: transaction.userId },
            { libraryCardNumber: transaction.userId }
        ];

        let user = null;
        for (const variant of borrowerLookupVariants) {
            user = await req.dbAdapter.findOneInCollection('users', variant);
            if (user) {
                break;
            }
        }
        if (user) {
            try {
                const stats = user.borrowingStats || { totalBorrowed: 0, currentlyBorrowed: 0, totalFines: 0, totalReturned: 0 };
                const updatedStats = {
                    totalBorrowed: (stats.totalBorrowed || 0) + items.length,
                    currentlyBorrowed: (stats.currentlyBorrowed || 0) + items.length,
                    totalFines: stats.totalFines || 0,
                    totalReturned: stats.totalReturned || 0
                };
                const userQuery = user.id ? { id: user.id } : { _id: user._id };
                await req.dbAdapter.updateInCollection('users', userQuery, { borrowingStats: updatedStats, updatedAt: new Date() });
            } catch (statsErr) {
                console.error('Failed to update borrower stats after approval:', statsErr);
            }

            const borrowerRecipients = buildRecipientList(user.id, user._id, user.userId, user.libraryCardNumber, user.email, user.username);
            if (
                notificationSettings.reservationNotifications !== false &&
                channelState.hasActiveChannel &&
                borrowerRecipients.length > 0
            ) {
                try {
                    const dueDateValue = dueDate instanceof Date ? dueDate : new Date(dueDate);
                    const dueDateIso = Number.isNaN(dueDateValue.getTime()) ? null : dueDateValue.toISOString();
                    const friendlyDueDate = dueDateIso ? dueDateIso.split('T')[0] : 'the scheduled due date';
                    
                    const reservationExpiresValue = reservationExpiresAt instanceof Date ? reservationExpiresAt : new Date(reservationExpiresAt);
                    const reservationExpiresIso = Number.isNaN(reservationExpiresValue.getTime()) ? null : reservationExpiresValue.toISOString();
                    const friendlyPickupDate = reservationExpiresIso ? reservationExpiresIso.split('T')[0] : 'the pickup deadline';
                    
                    await req.dbAdapter.insertIntoCollection('notifications', {
                        title: 'Borrow request approved',
                        message: `Your borrow request ${transaction.id || transaction._id} has been approved${approverName ? ` by ${approverName}` : ''}. Please pick up your items by ${friendlyPickupDate}. Items are due on ${friendlyDueDate}.`,
                        type: 'request-approved',
                        transactionId: transaction.id || transaction._id,
                        recipients: borrowerRecipients,
                        meta: {
                            transactionId: transaction.id || transaction._id,
                            dueDate: dueDateIso,
                            reservationExpiresAt: reservationExpiresIso,
                            itemCount: items.length,
                            status: 'borrowed',
                            approvedBy: req.user.id,
                            approvedByName: approverName
                        },
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        readBy: []
                    });
                } catch (notifyError) {
                    console.error('Failed to notify borrower about request approval:', notifyError);
                }
            }
        }
        else {
            console.warn('Approve request warning: borrower not found for transaction', transaction.id || transaction._id);
        }

        setAuditContext(req, {
            success: true,
            status: 'Approved',
            entityId: updatedTransaction.id || updatedTransaction._id,
            resourceId: updatedTransaction.id || updatedTransaction._id,
            description: `Approved borrow request ${transaction.id || transaction._id}`,
            metadata: { approvedBy: req.user.id }
        });

        // Mark related persistent notifications as read/archived
        try {
            const notifications = await req.dbAdapter.findInCollection('notifications', { transactionId: transaction.id || transaction._id });
            for (const n of notifications) {
                const q = n.id ? { id: n.id } : { _id: n._id };
                await req.dbAdapter.updateInCollection('notifications', q, { readBy: Array.from(new Set([...(n.readBy || []), req.user.id])), updatedAt: new Date(), archived: true });
            }
        } catch (nerr) {
            console.error('Failed to mark notifications after approve:', nerr);
        }

        res.json({ message: 'Borrow request approved', transactionId: updatedTransaction.id || updatedTransaction._id });
    } catch (error) {
        console.error('Approve request error:', error);
        setAuditContext(req, { success: false, status: 'Error', description: `Approve failed: ${error.message}`, details: { error: error.message } });
        res.status(500).json({ message: 'Failed to approve request' });
    }
});

// Reject a borrow request (staff only)
router.post('/reject/:id', verifyToken, requireCirculation, logAction('REJECT', 'transaction'), async (req, res) => {
    try {
        const txnIdentifier = req.params.id;
        const { reason } = req.body || {};
        const transaction = await findTransactionByIdentifier(req.dbAdapter, txnIdentifier);
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        if (transaction.status !== 'requested') {
            return res.status(400).json({ message: 'Only requested transactions can be rejected' });
        }

        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);

        const txQuery = transaction.id ? { id: transaction.id } : { _id: transaction._id };
        const updatedTransaction = await req.dbAdapter.updateInCollection('transactions', txQuery, {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectedBy: req.user.id,
            rejectReason: reason || ''
        });

        // Create a notification for the requester
        if (notificationSettings.reservationNotifications !== false && channelState.hasActiveChannel) {
            try {
                await req.dbAdapter.insertIntoCollection('notifications', {
                    title: 'Borrow request rejected',
                    message: `Your borrow request ${transaction.id || transaction._id} was rejected${reason ? `: ${reason}` : ''}`,
                    type: 'request-rejected',
                    transactionId: transaction.id || transaction._id,
                    recipients: [transaction.userId],
                    meta: { transactionId: transaction.id || transaction._id },
                    createdAt: new Date(),
                    readBy: []
                });
            } catch (nerr) {
                console.error('Failed to create notification for rejection:', nerr);
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Rejected',
            entityId: updatedTransaction.id || updatedTransaction._id,
            resourceId: updatedTransaction.id || updatedTransaction._id,
            description: `Rejected borrow request ${transaction.id || transaction._id}`,
            metadata: { rejectedBy: req.user.id, reason: reason || '' }
        });

        res.json({ message: 'Borrow request rejected', transactionId: updatedTransaction.id || updatedTransaction._id });
    } catch (error) {
        console.error('Reject request error:', error);
        setAuditContext(req, { success: false, status: 'Error', description: `Reject failed: ${error.message}`, details: { error: error.message } });
        res.status(500).json({ message: 'Failed to reject request' });
    }
});

router.post('/return', verifyToken, requireCirculation, logAction('RETURN', 'transaction'), async(req, res) => {
    try {
        const { transactions, returnDate, notes } = req.body || {};

        const transactionsPayload = Array.isArray(transactions) ? transactions : [];
        setAuditContext(req, {
            metadata: {
                returnRequest: {
                    transactionCount: transactionsPayload.length,
                    transactionIds: transactionsPayload
                        .map(entry => entry && entry.transactionId)
                        .filter(Boolean),
                    providedReturnDate: returnDate || null
                }
            },
            details: {
                notes: notes || ''
            }
        });

        if (!Array.isArray(transactions) || transactions.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'ValidationError',
                description: 'Return request missing transactions payload'
            });
            return res.status(400).json({ message: 'Transactions payload is required' });
        }

        const borrowingSettings = await getBorrowingSettings(req);
        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);
        const returnNotificationContext = {
            notificationSettings,
            channelState,
            actorName: getBorrowerName(req.user || {})
        };
        const results = [];
        let totalReturnedItems = 0;

        for (const entry of transactions) {
            if (!entry || !entry.transactionId) {
                setAuditContext(req, {
                    success: false,
                    status: 'ValidationError',
                    description: 'Return request is missing transactionId for one or more entries'
                });
                return res.status(400).json({ message: 'Each transaction entry must include a transactionId' });
            }

            const transaction = await findTransactionByIdentifier(req.dbAdapter, entry.transactionId);
            if (!transaction) {
                setAuditContext(req, {
                    success: false,
                    status: 'TransactionNotFound',
                    description: `Return request failed: transaction not found (${entry.transactionId})`,
                    entityId: entry.transactionId,
                    metadata: {
                        transactionId: entry.transactionId
                    }
                });
                return res.status(404).json({ message: `Transaction not found: ${entry.transactionId}` });
            }

            const itemsToProcess = Array.isArray(entry.items) && entry.items.length > 0
                ? entry.items.filter(item => item && item.copyId)
                : (transaction.items || []).filter(item => item.status !== 'returned').map(item => ({ copyId: item.copyId }));

            if (itemsToProcess.length === 0) {
                setAuditContext(req, {
                    success: false,
                    status: 'NoItemsToReturn',
                    description: `Return request failed: no returnable items for transaction ${entry.transactionId}`,
                    metadata: {
                        transactionId: entry.transactionId
                    }
                });
                return res.status(400).json({ message: `No returnable items found for transaction ${entry.transactionId}` });
            }

            const result = await processReturnTransaction({
                dbAdapter: req.dbAdapter,
                transaction,
                items: itemsToProcess,
                actorId: req.user.id,
                notes: notes || '',
                returnDateOverride: returnDate || null,
                borrowingSettings,
                notificationOptions: returnNotificationContext
            });

            totalReturnedItems += result.returnedItems;
            results.push({
                transactionId: transaction.id || transaction._id,
                ...result
            });
        }

        const singleTransactionId = results.length === 1 ? results[0].transactionId : null;

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            description: `Returned ${totalReturnedItems} item(s) across ${results.length} transaction(s)`,
            entityId: singleTransactionId || undefined,
            resourceId: singleTransactionId || undefined,
            metadata: {
                totalReturnedItems,
                processedTransactions: results.map(entry => entry.transactionId),
                actorId: req.user.id,
                providedReturnDate: returnDate || null
            },
            details: {
                results
            }
        });

        res.json({
            message: `Processed ${formatCountLabel(totalReturnedItems, 'item')} across ${formatCountLabel(results.length, 'transaction')}`,
            results
        });
    } catch (error) {
        console.error('Return books error:', error);
        setAuditContext(req, {
            success: false,
            status: error.message === 'Transaction not found' ? 'TransactionNotFound' : 'Error',
            description: `Return request failed: ${error.message}`,
            metadata: {
                errorName: error.name
            },
            details: {
                error: error.message
            }
        });
        if (error.message === 'Transaction not found') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'Transaction already returned' || error.message === 'No items provided for return') {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: 'Failed to return books' });
    }
});

router.post('/:id/return', verifyToken, requireCirculation, logAction('RETURN', 'transaction'), async(req, res) => {
    try {
        setAuditContext(req, {
            details: {
                transactionId: req.params.id
            },
            metadata: {
                returnRequest: {
                    transactionId: req.params.id,
                    providedReturnDate: (req.body && req.body.returnDate) || null,
                    hasNotes: Boolean(req.body && req.body.notes)
                }
            }
        });
        const borrowingSettings = await getBorrowingSettings(req);
        const notificationSettings = await getNotificationSettings(req);
        const channelState = getNotificationChannelState(notificationSettings);
        const returnNotificationContext = {
            notificationSettings,
            channelState,
            actorName: getBorrowerName(req.user || {})
        };
        const transaction = await findTransactionByIdentifier(req.dbAdapter, req.params.id);
        if (!transaction) {
            setAuditContext(req, {
                success: false,
                status: 'TransactionNotFound',
                description: `Return request failed: transaction ${req.params.id} not found`,
                entityId: req.params.id
            });
            return res.status(404).json({ message: 'Transaction not found' });
        }

        const itemsToProcess = (transaction.items || [])
            .filter(item => item && item.copyId && item.status !== 'returned')
            .map(item => ({ copyId: item.copyId }));
        if (itemsToProcess.length === 0) {
            setAuditContext(req, {
                success: false,
                status: 'NoItemsToReturn',
                description: `Return request failed: no items to return for transaction ${req.params.id}`,
                entityId: transaction.id || transaction._id || req.params.id
            });
            return res.status(400).json({ message: 'No items to return for this transaction' });
        }

        const result = await processReturnTransaction({
            dbAdapter: req.dbAdapter,
            transaction,
            items: itemsToProcess,
            actorId: req.user.id,
            notes: (req.body && req.body.notes) || '',
            returnDateOverride: (req.body && req.body.returnDate) || null,
            borrowingSettings,
            notificationOptions: returnNotificationContext
        });

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            entityId: transaction.id || transaction._id,
            resourceId: transaction.id || transaction._id,
            description: `Returned ${result.returnedItems} item(s) for transaction ${transaction.id || transaction._id}`,
            metadata: {
                actorId: req.user.id,
                returnedItems: result.returnedItems,
                providedReturnDate: (req.body && req.body.returnDate) || null,
                notes: (req.body && req.body.notes) || ''
            },
            details: {
                result
            }
        });

        res.json({
            message: 'Transaction returned successfully',
            ...result
        });
    } catch (error) {
        console.error('Return transaction error:', error);
        setAuditContext(req, {
            success: false,
            status: error.message === 'Transaction not found' ? 'TransactionNotFound' : error.message === 'Transaction already returned' ? 'AlreadyReturned' : 'Error',
            description: `Return request failed: ${error.message}`,
            metadata: {
                errorName: error.name
            },
            details: {
                error: error.message
            }
        });
        if (error.message === 'Transaction already returned') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Transaction not found') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ message: 'Failed to return transaction' });
    }
});

router.post('/expire-reservations', verifyToken, requireCirculation, logAction('EXPIRE_RESERVATIONS', 'transaction'), async (req, res) => {
    try {
        const now = new Date();
        
        // Find all borrowed transactions with expired reservations
        const expiredReservations = await req.dbAdapter.findInCollection('transactions', {
            status: 'borrowed',
            reservationExpiresAt: { $lt: now }
        });

        if (expiredReservations.length === 0) {
            return res.json({ message: 'No expired reservations found', expiredCount: 0 });
        }

        let expiredCount = 0;
        const results = [];

        for (const transaction of expiredReservations) {
            try {
                // Check if transaction is still active (not returned)
                const hasActiveItems = (transaction.items || []).some(item => item.status !== 'returned');
                if (!hasActiveItems) {
                    continue; // Skip already returned transactions
                }

                // Update transaction status to indicate expired reservation
                const txQuery = transaction.id ? { id: transaction.id } : { _id: transaction._id };
                await req.dbAdapter.updateInCollection('transactions', txQuery, {
                    status: 'reservation-expired',
                    reservationExpiredAt: now,
                    updatedAt: now,
                    notes: (transaction.notes || '') + ' [Reservation expired]'
                });

                // Make copies available again
                const allBooks = await req.dbAdapter.findInCollection('books', {});
                for (const item of transaction.items || []) {
                    if (item.status !== 'returned') {
                        // Find the book and update the copy status back to available
                        for (const book of allBooks) {
                            const copy = book.copies?.find(c => c.copyId === item.copyId);
                            if (copy && copy.status === 'borrowed') {
                                const updatedCopies = book.copies.map(c => 
                                    c.copyId === item.copyId ? { ...c, status: 'available', updatedAt: now } : c
                                );
                                const bookQuery = book.id ? { id: book.id } : { _id: book._id };
                                await req.dbAdapter.updateInCollection('books', bookQuery, {
                                    copies: updatedCopies,
                                    availableCopies: updatedCopies.filter(c => c.status === 'available').length,
                                    updatedAt: now
                                });
                                break;
                            }
                        }
                    }
                }

                // Update user borrowing stats
                let user = await req.dbAdapter.findOneInCollection('users', { id: transaction.userId });
                if (!user) user = await req.dbAdapter.findOneInCollection('users', { _id: transaction.userId });
                if (user) {
                    const stats = user.borrowingStats || { totalBorrowed: 0, currentlyBorrowed: 0, totalFines: 0, totalReturned: 0 };
                    const activeItems = (transaction.items || []).filter(item => item.status !== 'returned').length;
                    const updatedStats = {
                        ...stats,
                        currentlyBorrowed: Math.max(0, (stats.currentlyBorrowed || 0) - activeItems)
                    };
                    const userQuery = user.id ? { id: user.id } : { _id: user._id };
                    await req.dbAdapter.updateInCollection('users', userQuery, { borrowingStats: updatedStats, updatedAt: now });
                }

                expiredCount++;
                results.push({
                    transactionId: transaction.id || transaction._id,
                    userId: transaction.userId,
                    itemCount: (transaction.items || []).filter(item => item.status !== 'returned').length
                });

            } catch (error) {
                console.error(`Failed to expire reservation for transaction ${transaction.id || transaction._id}:`, error);
            }
        }

        setAuditContext(req, {
            success: true,
            status: 'Completed',
            description: `Expired ${expiredCount} reservations`,
            metadata: {
                expiredCount,
                actorId: req.user.id
            },
            details: {
                results
            }
        });

        res.json({ 
            message: `Expired ${expiredCount} reservations`, 
            expiredCount,
            results 
        });
    } catch (error) {
        console.error('Expire reservations error:', error);
        setAuditContext(req, {
            success: false,
            status: 'Error',
            description: `Expire reservations failed: ${error.message}`,
            details: { error: error.message }
        });
        res.status(500).json({ message: 'Failed to expire reservations' });
    }
});

module.exports = router;
module.exports.enrichTransactionsWithBookMetadata = enrichTransactionsWithBookMetadata;
