const { createNotification } = require('./notificationUtils');

const LOW_THRESHOLD = parseInt(process.env.BOOK_LOW_STOCK_THRESHOLD, 10) || 3;
const CRITICAL_THRESHOLD = parseInt(process.env.BOOK_CRITICAL_STOCK_THRESHOLD, 10) || 1;
const INVENTORY_FINGERPRINT_PREFIX = 'inventory-level';

const normalizeBookId = (book = {}) => {
  if (book.id) return String(book.id);
  if (book._id) return String(book._id);
  if (book.bookId) return String(book.bookId);
  if (book.documentId) return String(book.documentId);
  return null;
};

const computeAvailableCopies = (book = {}) => {
  if (book.availableCopies !== undefined) {
    const parsed = Number(book.availableCopies);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (Array.isArray(book.copies)) {
    return book.copies.filter((copy) => String(copy.status || '').toLowerCase() === 'available').length;
  }
  return null;
};

const computeTotalCopies = (book = {}) => {
  if (book.totalCopies !== undefined) {
    const parsed = Number(book.totalCopies);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (Array.isArray(book.copies)) {
    return book.copies.length;
  }
  return null;
};

const loadBookRecord = async (dbAdapter, identifier) => {
  if (!identifier) {
    return null;
  }
  try {
    return await dbAdapter.findOneInCollection('books', { id: identifier }) ||
      await dbAdapter.findOneInCollection('books', { _id: identifier }) ||
      await dbAdapter.findOneInCollection('books', { bookId: identifier });
  } catch (error) {
    console.error('Inventory notification lookup failed:', error.message);
    return null;
  }
};

const maybeNotifyLowInventory = async (dbAdapter, bookInput, { source } = {}) => {
  if (!dbAdapter) {
    return null;
  }

  let book = bookInput;
  if (!book || typeof book !== 'object') {
    book = await loadBookRecord(dbAdapter, bookInput);
  }
  if (!book) {
    return null;
  }

  const available = computeAvailableCopies(book);
  if (!Number.isFinite(available)) {
    return null;
  }

  const totalCopies = computeTotalCopies(book);
  const bookId = normalizeBookId(book);
  const fingerprint = bookId ? `${INVENTORY_FINGERPRINT_PREFIX}:${bookId}` : null;

  let severity = null;
  let level = null;
  if (available <= CRITICAL_THRESHOLD) {
    severity = 'high';
    level = 'critical';
  } else if (available <= LOW_THRESHOLD) {
    severity = 'medium';
    level = 'low';
  }

  const existing = fingerprint
    ? await dbAdapter.findOneInCollection('notifications', { fingerprint })
    : null;

  if (!level) {
    if (existing && !existing.archived) {
      await dbAdapter.updateInCollection(
        'notifications',
        existing.id ? { id: existing.id } : { _id: existing._id },
        {
          archived: true,
          updatedAt: new Date(),
          meta: {
            ...(existing.meta || {}),
            resolvedAt: new Date(),
            availableCopies: available,
            totalCopies,
          },
        },
      );
    }
    return null;
  }

  const title = level === 'critical' ? 'Critical book stock' : 'Low book stock';
  const copyLabel = available === 1 ? 'copy remains' : 'copies remain';
  const message = `'${book.title || 'Untitled book'}' only has ${available} ${copyLabel}.`;

  const payload = {
    title,
    message,
    type: 'inventory-level',
    severity,
    recipients: ['staff', 'librarian'],
    fingerprint,
    source: source || 'inventory-monitor',
    meta: {
      bookId,
      bookTitle: book.title || 'Untitled book',
      availableCopies: available,
      totalCopies,
      level,
    },
    link: bookId ? `/books/${bookId}` : undefined,
  };

  if (existing) {
    await dbAdapter.updateInCollection(
      'notifications',
      existing.id ? { id: existing.id } : { _id: existing._id },
      {
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        recipients: payload.recipients,
        meta: payload.meta,
        archived: false,
        readBy: [],
        updatedAt: new Date(),
      },
    );
    return null;
  }

  return createNotification(dbAdapter, payload);
};

module.exports = {
  maybeNotifyLowInventory,
};
