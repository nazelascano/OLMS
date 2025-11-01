process.env.USE_OFFLINE_DB = 'true';

const request = require('supertest');
const app = require('../app');

describe('Users API normalization', () => {
  test('GET /api/users returns users with studentNumber normalized', async () => {
    const res = await request(app).get('/api/users');
    expect(res.statusCode).toBe(200);
    const users = res.body.users;
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const student = users.find(u => u.role === 'student');
    expect(student).toBeDefined();
    expect(student).toHaveProperty('studentNumber');
    expect(typeof student.studentNumber).toBe('string');
  });

  test('GET /api/users/:id returns user with studentNumber', async () => {
    const resAll = await request(app).get('/api/users');
    expect(resAll.statusCode).toBe(200);
    const uid = resAll.body.users[0]._id;
    const res = await request(app).get(`/api/users/${uid}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('studentNumber');
  });
});
