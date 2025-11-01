process.env.USE_OFFLINE_DB = 'true';

const request = require('supertest');
const app = require('../app');

describe('Transactions request API', () => {
  test('POST /api/transactions/request creates a requested transaction', async () => {
    // Create a simple request payload - no userId provided, test auth should attach a test user
    const payload = { items: [{ copyId: 'copy-1' }, { copyId: 'copy-2' }], type: 'regular', notes: 'Student request test' };
    const res = await request(app).post('/api/transactions/request').send(payload);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('transactionId');
    expect(res.body).toHaveProperty('transaction');
    const txn = res.body.transaction;
    expect(txn).toHaveProperty('status', 'requested');
    expect(Array.isArray(txn.items)).toBe(true);
    expect(txn.items.length).toBe(2);
    expect(txn.userId).toBeDefined();
  });
});
