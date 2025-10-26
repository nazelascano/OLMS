const express = require('express');
const { verifyToken } = require('../middleware/customAuth');

const router = express.Router();

const toLower = (value) => (value ? String(value).toLowerCase() : '');
const includesTerm = (value, term) => toLower(value).includes(term);
const toIsoString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};
const formatDueLabel = (value) => {
  const iso = toIsoString(value);
  if (!iso) return '';
  return `Due ${iso.slice(0, 10)}`;
};
const limitItems = (items, limit) => items.slice(0, limit);

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
    dueLabel: formatDueLabel(transaction.dueDate),
    timestamp:
      toIsoString(transaction.dueDate) ||
      toIsoString(transaction.borrowDate) ||
      toIsoString(transaction.createdAt),
    status: (transaction.status || '').toLowerCase(),
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

router.get('/', verifyToken, async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.json({ query, results: {}, total: 0 });
    }

    const role = req.user.role || 'student';
    const limit = Math.max(parseInt(req.query.limit, 10) || 5, 1);
    const term = query.toLowerCase();

    const [books, users, transactions] = await Promise.all([
      req.dbAdapter.findInCollection('books', {}),
      req.dbAdapter.findInCollection('users', {}),
      req.dbAdapter.findInCollection('transactions', {}),
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

    const results = {};

    const bookMatches = books.filter(
      (book) =>
        includesTerm(book.title, term) ||
        includesTerm(book.author, term) ||
        includesTerm(book.isbn, term) ||
        includesTerm(book.publisher, term) ||
        includesTerm(book.category, term),
    );

    if (bookMatches.length) {
      results.books = limitItems(bookMatches, limit).map((book) => {
        const id = String(book.id || book._id);
        return {
          id,
          primary: book.title || 'Untitled book',
          secondary: [book.author, book.isbn].filter(Boolean).join(' • '),
          chip: book.category || '',
          link: `/books/${id}`,
          category: 'books',
          status: book.status || '',
        };
      });
    }

    const canViewStaffData = role !== 'student';

    if (canViewStaffData) {
      const userMatches = users.filter(
        (user) =>
          includesTerm(user.firstName, term) ||
          includesTerm(user.lastName, term) ||
          includesTerm(user.middleName, term) ||
          includesTerm(user.username, term) ||
          includesTerm(user.email, term) ||
          includesTerm(user.studentNumber, term) ||
          includesTerm(user.studentId, term) ||
          includesTerm(user.curriculum, term) ||
          includesTerm(user.gradeLevel, term),
      );

      const staff = userMatches.filter((user) => user.role && user.role !== 'student');
      const students = userMatches.filter((user) => user.role === 'student');

      if (staff.length) {
        results.users = limitItems(staff, limit).map((user) => {
          const id = String(user._id || user.id);
          const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
          const secondary = [user.role, user.email || user.username]
            .filter(Boolean)
            .join(' • ');

          return {
            id,
            primary: fullName || user.username || 'User',
            secondary,
            chip: (user.role || '').toUpperCase(),
            link: `/users/${id}`,
            category: 'users',
          };
        });
      }

      if (students.length) {
        results.students = limitItems(students, limit).map((student) => {
          const id = String(student._id || student.id);
          const fullName = [student.firstName, student.lastName]
            .filter(Boolean)
            .join(' ');
          const secondary = [
            student.studentId || student.studentNumber,
            student.gradeLevel || student.grade,
            student.section,
          ]
            .filter(Boolean)
            .join(' • ');

          return {
            id,
            primary: fullName || student.username || 'Student',
            secondary,
            chip: 'STUDENT',
            link: `/students/${id}`,
            category: 'students',
          };
        });
      }
    }

    const identifiers = collectUserIdentifiers(req.user);
    const relevantTransactions = transactions.filter((transaction) =>
      canViewStaffData ? true : transactionBelongsToUser(transaction, identifiers),
    );

    const transactionMatches = relevantTransactions.filter((transaction) => {
      const summary = buildTransactionSummary(transaction, { bookMap, userMap });
      return (
        includesTerm(summary.title, term) ||
        includesTerm(summary.borrower, term) ||
        includesTerm(transaction.referenceNumber, term) ||
        includesTerm(transaction.transactionCode, term)
      );
    });

    if (canViewStaffData && transactionMatches.length) {
      results.transactions = limitItems(transactionMatches, limit).map((transaction) => {
        const summary = buildTransactionSummary(transaction, { bookMap, userMap });
        const id = String(transaction.id || transaction._id);
        const chip = summary.status ? summary.status.toUpperCase() : '';

        return {
          id,
          primary: summary.title || `Transaction ${id}`,
          secondary: [summary.borrower, summary.dueLabel].filter(Boolean).join(' • '),
          chip,
          link: `/transactions/${id}`,
          category: 'transactions',
          timestamp: summary.timestamp,
        };
      });
    }

    const total = Object.values(results).reduce(
      (acc, section) => acc + (Array.isArray(section) ? section.length : 0),
      0,
    );

    res.json({ query, results, total });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ message: 'Failed to run search' });
  }
});

module.exports = router;
