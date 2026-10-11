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

  it('CORS headers should allow http://localhost:5173 and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow http://localhost:5174 and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5174');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5174');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow http://localhost:5175 and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5175');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5175');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow dynamically assigned development ports (e.g. 5199)', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5199');

    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5199');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow legitimate 127.0.0.1 development frontend origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:5174');

    assert.equal(res.headers['access-control-allow-origin'], 'http://127.0.0.1:5174');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow LAN IP http://10.162.61.69:5173 and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://10.162.61.69:5173');

    assert.equal(res.headers['access-control-allow-origin'], 'http://10.162.61.69:5173');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS headers should allow LAN IP across dynamically assigned Vite ports (5174, 5175)', async () => {
    for (const port of [5174, 5175]) {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', `http://10.162.61.69:${port}`);

      assert.equal(res.headers['access-control-allow-origin'], `http://10.162.61.69:${port}`);
      assert.equal(res.headers['access-control-allow-credentials'], 'true');
    }
  });

  it('CORS preflight OPTIONS request succeeds for LAN IP origin http://10.162.61.69:5173', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://10.162.61.69:5173')
      .set('Access-Control-Request-Method', 'GET');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://10.162.61.69:5173');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods']);
  });

  it('CORS headers are included when /api/auth/me returns 401 for localhost and LAN IP', async () => {
    // Localhost origin on 401
    const localRes = await request(app)
      .get('/api/auth/me')
      .set('Origin', 'http://localhost:5173');

    assert.equal(localRes.status, 401);
    assert.equal(localRes.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(localRes.headers['access-control-allow-credentials'], 'true');

    // LAN IP origin on 401
    const lanRes = await request(app)
      .get('/api/auth/me')
      .set('Origin', 'http://10.162.61.69:5173');

    assert.equal(lanRes.status, 401);
    assert.equal(lanRes.headers['access-control-allow-origin'], 'http://10.162.61.69:5173');
    assert.equal(lanRes.headers['access-control-allow-credentials'], 'true');
  });

  it('CORS preflight OPTIONS request succeeds for dynamic local dev origin', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'GET');

    assert.equal(res.status, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5174');
    assert.equal(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods']);
  });

  it('CORS headers are omitted for non-browser requests without an Origin header', async () => {
    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('CORS headers should not allow disallowed or malicious origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://malicious.example.com');

    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('CORS preflight OPTIONS request does not allow disallowed origins', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://malicious.example.com')
      .set('Access-Control-Request-Method', 'GET');

    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('CORS headers reject deceptive localhost subdomains (e.g. localhost.attacker.com)', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost.attacker.com');

    assert.equal(res.headers['access-control-allow-origin'], undefined);
  });

  it('Production mode strictly requires configured origins and rejects localhost and unconfigured origins', async () => {
    const { createApp, createCorsOriginValidator } = require('../src/app');

    const prodApp = createApp({
      corsOrigin: createCorsOriginValidator('https://meetup-pulse.com', 'production')
    });

    // Configured production origin is allowed
    const configuredRes = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'https://meetup-pulse.com');
    assert.equal(configuredRes.headers['access-control-allow-origin'], 'https://meetup-pulse.com');
    assert.equal(configuredRes.headers['access-control-allow-credentials'], 'true');

    // Localhost origins are strictly rejected in production
    const devRes5174 = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'http://localhost:5174');
    assert.equal(devRes5174.headers['access-control-allow-origin'], undefined);

    const devRes5173 = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    assert.equal(devRes5173.headers['access-control-allow-origin'], undefined);

    // LAN IP origins are strictly rejected in production
    const lanRes = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'http://10.162.61.69:5173');
    assert.equal(lanRes.headers['access-control-allow-origin'], undefined);

    // Malicious external origins are strictly rejected in production
    const evilRes = await request(prodApp)
      .get('/api/health')
      .set('Origin', 'http://malicious.example.com');
    assert.equal(evilRes.headers['access-control-allow-origin'], undefined);
  });

  it('resolveAllowedOrigins strictly enforces production restrictions and parses multi-origin config', () => {
    const { resolveAllowedOrigins } = require('../src/app');

    // Production: strictly allows only explicitly configured origins without wildcards or automatic localhost ports
    const prodOrigins = resolveAllowedOrigins('https://meetup-pulse.com, https://admin.meetup-pulse.com', 'production');
    assert.deepEqual(prodOrigins, ['https://meetup-pulse.com', 'https://admin.meetup-pulse.com']);
    assert.ok(!prodOrigins.includes('*'));
    assert.ok(!prodOrigins.includes('http://localhost:5173'));
    assert.ok(!prodOrigins.includes('http://localhost:5174'));
    assert.ok(!prodOrigins.includes('http://localhost:5175'));

    // Development: includes standard dev ports
    const devOrigins = resolveAllowedOrigins('http://localhost:5173', 'development');
    assert.ok(devOrigins.includes('http://localhost:5173'));
    assert.ok(devOrigins.includes('http://localhost:5174'));
    assert.ok(devOrigins.includes('http://localhost:5175'));
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
