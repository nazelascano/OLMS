process.env.USE_OFFLINE_DB = 'true';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../app');

const dbAdapter = app.dbAdapter;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const createdTransactionIds = [];

const insertTransaction = async (overrides = {}) => {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const defaultItems = [
    {
      copyId: `copy_${suffix}`,
      bookId: `book_${suffix}`,
      status: overrides.status === 'returned' ? 'returned' : 'borrowed',
    },
  ];

  const record = {
    _id: `test_txn_${suffix}`,
    id: `test_txn_${suffix}`,
    userId: `test_user_${suffix}`,
    type: 'regular',
    status: 'borrowed',
    items: defaultItems,
    borrowDate: now.toISOString(),
    dueDate: new Date(now.getTime() + 7 * DAY_IN_MS).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };

  if (!Array.isArray(record.items) || record.items.length === 0) {
    record.items = defaultItems;
  }

  const inserted = await dbAdapter.insertIntoCollection('transactions', record);
  createdTransactionIds.push(inserted._id);
  return inserted;
};

describe('GET /api/transactions filters', () => {
  beforeAll(async () => {
    await dbAdapter.connect();
    await dbAdapter.initialize();
  });

  afterAll(async () => {
    for (const id of createdTransactionIds) {
      await dbAdapter.deleteFromCollection('transactions', { _id: id });
    }
  });

  test('returns only active transactions when filtering by status=active', async () => {
    const userId = `status-active-${Date.now()}`;
    await insertTransaction({ userId, status: 'borrowed', dueDate: new Date(Date.now() + DAY_IN_MS).toISOString() });
    await insertTransaction({ userId, status: 'returned', returnDate: new Date().toISOString() });

    const res = await request(app)
      .get('/api/transactions')
      .query({ status: 'active', userId, limit: 50 });

    expect(res.statusCode).toBe(200);
    const transactions = Array.isArray(res.body?.transactions) ? res.body.transactions : [];
    expect(transactions.length).toBe(1);
    expect(transactions[0].userId).toBe(userId);
    expect(transactions[0].status).toBe('active');
  });

  test('returns only overdue transactions when filtering by status=overdue', async () => {
    const userId = `status-overdue-${Date.now()}`;
    await insertTransaction({
      userId,
      status: 'borrowed',
      dueDate: new Date(Date.now() - DAY_IN_MS).toISOString(),
    });
    await insertTransaction({
      userId,
      status: 'borrowed',
      dueDate: new Date(Date.now() + 3 * DAY_IN_MS).toISOString(),
    });

    const res = await request(app)
      .get('/api/transactions')
      .query({ status: 'overdue', userId, limit: 50 });

    expect(res.statusCode).toBe(200);
    const transactions = Array.isArray(res.body?.transactions) ? res.body.transactions : [];
    expect(transactions.length).toBe(1);
    expect(transactions[0].userId).toBe(userId);
    expect(new Date(transactions[0].dueDate).getTime()).toBeLessThan(Date.now());
  });

  test('returns both annual and annual-set types when filtering by type=annual', async () => {
    const userId = `type-annual-${Date.now()}`;
    await insertTransaction({ userId, type: 'annual', status: 'borrowed' });
    await insertTransaction({ userId, type: 'annual-set', status: 'borrowed' });
    await insertTransaction({ userId, type: 'regular', status: 'borrowed' });

    const res = await request(app)
      .get('/api/transactions')
      .query({ type: 'annual', userId, limit: 50 });

    expect(res.statusCode).toBe(200);
    const transactions = Array.isArray(res.body?.transactions) ? res.body.transactions : [];
    expect(transactions.length).toBe(2);
    const returnedTypes = transactions.map((txn) => txn.type).sort();
    expect(returnedTypes).toEqual(expect.arrayContaining(['annual', 'annual-set']));
  });
});
