process.env.NODE_ENV = 'test';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');

describe('MEETUP Pulse — Foundation & Health Checks', () => {
  before(async () => {
    // Ensure database connection is established for session store
    await connectDB();
  });

  after(async () => {
    // Cleanly close session store and database connection
    await closeSessionStore();
    await disconnectDB();
  });

  it('GET /api/health should return 200 with standard success envelope', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.ok(res.body.data.timestamp);
    assert.equal(res.body.data.environment, 'test');
  });

  it('GET /api/unknown-endpoint should return 404 with standard error envelope', async () => {
    const res = await request(app).get('/api/unknown-endpoint');

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('/api/unknown-endpoint'));
  });

  it('CORS headers should allow configured origin and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('Unauthenticated requests do not set unnecessary cookies (saveUninitialized: false)', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.headers['set-cookie'], undefined);
  });

  it('Session cookie connect.sid is issued, httpOnly, and persists when session is modified', async () => {
    // 1. Initialize session on endpoint
    const initRes = await request(app)
      .post('/api/test/session')
      .send({ userId: 'user_12345' });

    assert.equal(initRes.status, 200);
    assert.equal(initRes.body.success, true);
    assert.equal(initRes.body.data.userId, 'user_12345');

    // 2. Validate Set-Cookie header
    const setCookie = initRes.headers['set-cookie'];
    assert.ok(setCookie, 'Expected Set-Cookie header when session is modified');
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    assert.ok(cookieStr.includes('connect.sid='), 'Cookie should contain connect.sid');
    assert.ok(cookieStr.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');

    // 3. Extract cookie and verify session persistence on subsequent request
    const checkRes = await request(app)
      .get('/api/test/session')
      .set('Cookie', setCookie);

    assert.equal(checkRes.status, 200);
    assert.equal(checkRes.body.success, true);
    assert.equal(checkRes.body.data.userId, 'user_12345');
  });
});
