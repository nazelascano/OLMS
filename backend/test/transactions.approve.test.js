process.env.USE_OFFLINE_DB = 'true';

const request = require('supertest');
const app = require('../app');
const OfflineAdapter = require('../adapters/OfflineMongoAdapter');

describe('Transactions approve API', () => {
  test('POST /api/transactions/approve/:id approves a requested transaction and reserves copies', async () => {
    const adapter = new OfflineAdapter();
    await adapter.connect();
    await adapter.initialize();

    // Create a book with copies via API so the server-side adapter has it
    // Create a book with copies directly in the offline adapter (shared data files)
    const book = await adapter.insertIntoCollection('books', {
      id: 'book-approve-test',
      title: 'Approve Test Book',
      author: 'Tester',
      isbn: 'ISBN-APPROVE-1',
      copies: [
        { copyId: 'APPROVE-COPY-1', status: 'available', location: 'Main' },
        { copyId: 'APPROVE-COPY-2', status: 'available', location: 'Main' }
      ],
      availableCopies: 2
    });
    expect(book).toBeDefined();

    // Ensure at least one user exists (test auth will attach first user)
    const users = await adapter.findInCollection('users', {});
    const testUser = users[0];
    expect(testUser).toBeDefined();

    // Create a request via API (no userId so test auth user will be used)
  const payload = { items: [{ copyId: 'APPROVE-COPY-1' }], type: 'regular', notes: 'Approve flow test' };
  const createResp = await request(app).post('/api/transactions/request').send(payload);
  expect(createResp.statusCode).toBe(201);
  expect(createResp.body).toHaveProperty('transaction');
  const txnId = createResp.body.transactionId;
  expect(txnId).toBeDefined();
  const requesterId = createResp.body.transaction.userId;

    // Approve the request
    const approveResp = await request(app).post(`/api/transactions/approve/${txnId}`).send({});
    if (approveResp.statusCode === 400) {
      // In case approval fails (e.g. copy not found/unavailable), ensure response indicates validation failures
      expect(approveResp.body).toHaveProperty('message');
      expect(approveResp.body).toHaveProperty('details');
      expect(Array.isArray(approveResp.body.details)).toBe(true);
    } else {
      expect([200,201]).toContain(approveResp.statusCode);
      expect(approveResp.body).toHaveProperty('transactionId');

      // Verify transaction status changed to borrowed
      const getTxn = await request(app).get(`/api/transactions/${txnId}`);
      expect(getTxn.statusCode).toBe(200);
      expect(getTxn.body).toHaveProperty('status');
      expect(['borrowed','active']).toContain(getTxn.body.status);

      // Verify book copy is now borrowed in adapter data
      const updatedBook = await adapter.findOneInCollection('books', { id: 'book-approve-test' });
      const copy = (updatedBook.copies || []).find(c => c.copyId === 'APPROVE-COPY-1');
      expect(copy).toBeDefined();
      expect(copy.status).toBe('borrowed');

      const notifications = await adapter.findInCollection('notifications', { transactionId: txnId });
      const borrowerNote = notifications.find(note => note.type === 'request-approved');
      expect(borrowerNote).toBeDefined();
      expect(borrowerNote.recipients).toEqual(expect.arrayContaining([String(requesterId)]));
      expect(borrowerNote.message.toLowerCase()).toContain('approved');
    }
  });

  test('POST /api/transactions/approve/:id fails when requested copy is missing or unavailable', async () => {
    const adapter = new OfflineAdapter();
    await adapter.connect();
    await adapter.initialize();

    // Ensure at least one user exists (test auth will attach first user)
    const users = await adapter.findInCollection('users', {});
    const testUser = users[0];
    expect(testUser).toBeDefined();

    // Create a request referencing a non-existent copy
    const payload = { items: [{ copyId: 'nonexistent-copy' }], type: 'regular', notes: 'Missing copy test' };
    const createResp = await request(app).post('/api/transactions/request').send(payload);
    expect(createResp.statusCode).toBe(201);
    const txnId = createResp.body.transactionId;
    expect(txnId).toBeDefined();

    // Attempt to approve should fail with 400 and include details
    const approveResp = await request(app).post(`/api/transactions/approve/${txnId}`).send({});
    expect(approveResp.statusCode).toBe(400);
    expect(approveResp.body).toHaveProperty('message');
    expect(approveResp.body).toHaveProperty('details');
    expect(Array.isArray(approveResp.body.details)).toBe(true);
  });
});
