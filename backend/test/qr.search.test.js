process.env.USE_OFFLINE_DB = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');
const OfflineAdapter = require('../adapters/OfflineMongoAdapter');

const TEST_BOOK_ID = 'qr-search-book';
const TEST_ISBN = 'QR-SEARCH-ISBN-001';
const TEST_COPY_ID = 'QR-COPY-001';
const TEST_USER_USERNAME = 'qr-search-student';
const TEST_LIBRARY_CARD = 'LIB-QR-0001';
const TEST_TRANSACTION_ID = 'qr-search-transaction';

let adapter;
let testUser;
let testBook;

beforeAll(async () => {
  adapter = new OfflineAdapter();
  await adapter.connect();
  await adapter.initialize();

  await adapter.deleteFromCollection('transactions', { id: TEST_TRANSACTION_ID });
  await adapter.deleteFromCollection('books', { id: TEST_BOOK_ID });
  await adapter.deleteFromCollection('users', { username: TEST_USER_USERNAME });

  testBook = await adapter.insertIntoCollection('books', {
    id: TEST_BOOK_ID,
    title: 'QR Search Test Book',
    author: 'Test Author',
    isbn: TEST_ISBN,
    publisher: 'Test Publisher',
    category: 'Testing',
    status: 'active',
    totalCopies: 1,
    availableCopies: 1,
    copies: [
      {
        copyId: TEST_COPY_ID,
        status: 'available',
        condition: 'good',
        location: 'QA Stacks'
      }
    ]
  });

  testUser = await adapter.insertIntoCollection('users', {
    username: TEST_USER_USERNAME,
    firstName: 'QR',
    lastName: 'Scanner',
    role: 'student',
    isActive: true,
    libraryCardNumber: TEST_LIBRARY_CARD,
    borrowingStats: {
      totalBorrowed: 0,
      currentlyBorrowed: 0,
      totalFines: 0,
      totalReturned: 0
    }
  });

  await adapter.insertIntoCollection('transactions', {
    id: TEST_TRANSACTION_ID,
    userId: testUser._id,
    items: [
      {
        copyId: TEST_COPY_ID,
        bookId: testBook.id,
        isbn: TEST_ISBN,
        status: 'borrowed'
      }
    ],
    type: 'regular',
    status: 'borrowed',
    borrowDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'QR search validation'
  });
});

afterAll(async () => {
  await adapter.deleteFromCollection('transactions', { id: TEST_TRANSACTION_ID });
  await adapter.deleteFromCollection('books', { id: TEST_BOOK_ID });
  await adapter.deleteFromCollection('users', { username: TEST_USER_USERNAME });
});

describe('QR and identifier search flows', () => {
  test('Book catalogue search accepts copy QR values', async () => {
    const res = await request(app)
      .get('/api/books')
      .query({ search: TEST_COPY_ID, limit: 5 });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.books)).toBe(true);
    const matched = res.body.books.some((book) =>
      Array.isArray(book.copies) && book.copies.some((copy) => copy.copyId === TEST_COPY_ID)
    );
    expect(matched).toBe(true);
  });

  test('Book search endpoint finds copies by QR value', async () => {
    const res = await request(app)
      .get('/api/books/search')
      .query({ q: TEST_COPY_ID, limit: 5 });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const match = res.body.find((entry) =>
      Array.isArray(entry.copies) && entry.copies.some((copy) => copy.copyId === TEST_COPY_ID)
    );
    expect(match).toBeDefined();
  });

  test('Transactions search matches scanned reference IDs', async () => {
    const res = await request(app)
      .get('/api/transactions')
      .query({ search: TEST_COPY_ID, page: 1, limit: 10 });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    const row = res.body.transactions.find((txn) => txn.copyId === TEST_COPY_ID);
    expect(row).toBeDefined();
    expect(row.transactionId || row.id).toBeDefined();
  });

  test('User search returns records by library card number', async () => {
    const res = await request(app)
      .get('/api/users/search')
      .query({ q: TEST_LIBRARY_CARD, limit: 5 });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const user = res.body.find((entry) => entry.libraryCardNumber === TEST_LIBRARY_CARD);
    expect(user).toBeDefined();
    expect(user).toHaveProperty('username', TEST_USER_USERNAME);
  });
});
