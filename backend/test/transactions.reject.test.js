process.env.USE_OFFLINE_DB = 'true';

const request = require('supertest');
const app = require('../app');
const OfflineAdapter = require('../adapters/OfflineMongoAdapter');

describe('Transactions reject API', () => {
  test('POST /api/transactions/reject/:id rejects a requested transaction and notifies user', async () => {
    const adapter = new OfflineAdapter();
    await adapter.connect();
    await adapter.initialize();

    // Create a book with copies
    const book = await adapter.insertIntoCollection('books', {
      id: 'book-reject-test',
      title: 'Reject Test Book',
      author: 'Tester',
      isbn: 'ISBN-REJECT-1',
      copies: [
        { copyId: 'reject-copy-1', status: 'available', location: 'Main' }
      ],
      availableCopies: 1
    });

    // Create a request via API (no userId so test auth user will be used)
    const payload = { items: [{ copyId: 'reject-copy-1' }], type: 'regular', notes: 'Reject flow test' };
    const createResp = await request(app).post('/api/transactions/request').send(payload);
    expect(createResp.statusCode).toBe(201);
    const txnId = createResp.body.transactionId;
    expect(txnId).toBeDefined();

    // Reject the request
    const reason = 'Not available for loan';
    const rejectResp = await request(app).post(`/api/transactions/reject/${txnId}`).send({ reason });
    expect(rejectResp.statusCode).toBe(200);
    expect(rejectResp.body).toHaveProperty('transactionId');

    // Verify transaction status changed to rejected
    const getTxn = await request(app).get(`/api/transactions/${txnId}`);
    expect(getTxn.statusCode).toBe(200);
    expect(getTxn.body).toHaveProperty('status');
    expect(getTxn.body.status).toBe('rejected');

    // Verify a notification was created for the requester
    const notes = await adapter.findInCollection('notifications', { transactionId: txnId });
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBeGreaterThan(0);
    const note = notes.find(n => n.type === 'request-rejected');
    expect(note).toBeDefined();
    expect(note.message).toContain('rejected');
  });
});
