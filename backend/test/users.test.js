process.env.USE_OFFLINE_DB = 'true';

const request = require('supertest');
const app = require('../app');

describe('Users API normalization', () => {
  test('GET /api/users returns users with libraryCardNumber', async () => {
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(200);
    const users = res.body.users;
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const student = users.find(u => u.role === 'student');
    expect(student).toBeDefined();
    expect(student).toHaveProperty('libraryCardNumber');
    expect(typeof student.libraryCardNumber).toBe('string');
  });

  test('GET /api/users/:id returns user with library card number', async () => {
    const resAll = await request(app).get('/api/users');
    expect(resAll.statusCode).toBe(200);
    const uid = resAll.body.users[0]._id;
    const res = await request(app).get(`/api/users/${uid}`);
    expect(res.statusCode).toBe(200);
    const cardNumber = res.body.libraryCardNumber || res.body?.library?.cardNumber;
    expect(typeof cardNumber).toBe('string');
    expect(cardNumber.length).toBeGreaterThan(0);
  });
});
