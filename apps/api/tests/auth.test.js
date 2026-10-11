process.env.NODE_ENV = 'test';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');
const User = require('../src/models/User');

describe('MEETUP Pulse — Authentication Endpoints', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /@auth-test\.example\.com$/i } });
    await closeSessionStore();
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@auth-test\.example\.com$/i } });
  });

  describe('POST /api/auth/register', () => {
    it('Registers a new user, hashes password, sets isVerified=false, and returns public profile', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          displayName: 'John Doe',
          email: 'john.doe@auth-test.example.com',
          password: 'Password123!'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.displayName, 'John Doe');
      assert.equal(res.body.data.email, 'john.doe@auth-test.example.com');
      assert.equal(res.body.data.isVerified, false);
      assert.equal(res.body.data.searchRadiusKm, 3);
      assert.equal(res.body.data.passwordHash, undefined);
      assert.equal(res.body.data.verificationToken, undefined);

      // Verify database persistence and password hashing
      const savedUser = await User.findOne({ email: 'john.doe@auth-test.example.com' }).select('+passwordHash');
      assert.ok(savedUser);
      assert.notEqual(savedUser.passwordHash, 'Password123!');
      const isHashValid = await bcrypt.compare('Password123!', savedUser.passwordHash);
      assert.equal(isHashValid, true);
    });

    it('Rejects duplicate email with HTTP 409 Conflict', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          displayName: 'First User',
          email: 'duplicate@auth-test.example.com',
          password: 'Password123!'
        });

      // Second registration with same email (case variation)
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          displayName: 'Second User',
          email: 'DUPLICATE@auth-test.example.com',
          password: 'Password456!'
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'CONFLICT');
      assert.ok(res.body.error.message.includes('already exists'));
    });

    it('Validates input fields and returns 400 for invalid formats', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          displayName: 'A', // too short (< 2)
          email: 'not-an-email',
          password: 'short' // too short (< 8)
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.fields.displayName);
      assert.ok(res.body.error.fields.email);
      assert.ok(res.body.error.fields.password);
    });
  });

  describe('POST /api/auth/login', () => {
    it('Blocks login for unverified accounts with 403 EMAIL_NOT_VERIFIED', async () => {
      // Create unverified user
      await request(app)
        .post('/api/auth/register')
        .send({
          displayName: 'Unverified User',
          email: 'unverified@auth-test.example.com',
          password: 'Password123!'
        });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unverified@auth-test.example.com',
          password: 'Password123!'
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
      assert.ok(res.body.error.message.includes('verify your email'));
    });

    it('Rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
      // Create user and mark verified for test
      const user = await User.create({
        displayName: 'Verified Bob',
        email: 'bob@auth-test.example.com',
        passwordHash: await bcrypt.hash('CorrectPassword123!', 10),
        isVerified: true
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'bob@auth-test.example.com',
          password: 'WrongPassword999!'
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(res.body.error.message, 'Invalid email or password.');
    });

    it('Rejects non-existent email with generic 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nobody@auth-test.example.com',
          password: 'Password123!'
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(res.body.error.message, 'Invalid email or password.');
    });

    it('Logs in verified user, regenerates session, and issues connect.sid cookie', async () => {
      await User.create({
        displayName: 'Verified Jane',
        email: 'jane@auth-test.example.com',
        passwordHash: await bcrypt.hash('Secret12345!', 10),
        isVerified: true
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: '  JANE@auth-test.example.com  ', // test normalization
          password: 'Secret12345!'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.displayName, 'Verified Jane');
      assert.equal(res.body.data.email, 'jane@auth-test.example.com');
      assert.equal(res.body.data.passwordHash, undefined);

      const setCookie = res.headers['set-cookie'];
      assert.ok(setCookie);
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
      assert.ok(cookieStr.includes('connect.sid='));
      assert.ok(cookieStr.toLowerCase().includes('httponly'));
    });
  });

  describe('GET /api/auth/me and Session Persistence', () => {
    it('Returns authenticated user profile when session cookie is present', async () => {
      const user = await User.create({
        displayName: 'Logged In User',
        email: 'loggedin@auth-test.example.com',
        passwordHash: await bcrypt.hash('Secret12345!', 10),
        isVerified: true,
        interests: ['climbing', 'cycling']
      });

      // Log in to get session cookie
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'loggedin@auth-test.example.com',
          password: 'Secret12345!'
        });

      const cookie = loginRes.headers['set-cookie'];

      // Access /me with session cookie
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.success, true);
      assert.equal(meRes.body.data.id, user._id.toString());
      assert.equal(meRes.body.data.displayName, 'Logged In User');
      assert.equal(meRes.body.data.email, 'loggedin@auth-test.example.com');
      assert.deepEqual(meRes.body.data.interests, ['climbing', 'cycling']);
      assert.equal(meRes.body.data.passwordHash, undefined);
    });

    it('Rejects unauthenticated request to /api/auth/me with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/auth/me');

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
      assert.ok(res.body.error.message.includes('Authentication required'));
    });
  });

  describe('POST /api/auth/logout', () => {
    it('Destroys active session, clears cookie, and invalidates future requests', async () => {
      await User.create({
        displayName: 'Logout User',
        email: 'logout@auth-test.example.com',
        passwordHash: await bcrypt.hash('Secret12345!', 10),
        isVerified: true
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logout@auth-test.example.com',
          password: 'Secret12345!'
        });

      const cookie = loginRes.headers['set-cookie'];

      // Logout with active cookie
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      assert.equal(logoutRes.status, 200);
      assert.equal(logoutRes.body.success, true);
      assert.equal(logoutRes.body.data.loggedOut, true);

      // Verify that subsequent request with that session fails
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      assert.equal(meRes.status, 401);
      assert.equal(meRes.body.error.code, 'UNAUTHORIZED');
    });

    it('Rejects unauthenticated logout request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/auth/logout');

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });
  });
});
