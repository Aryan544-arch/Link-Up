process.env.NODE_ENV = 'test';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');
const User = require('../src/models/User');
const { getDevVerificationToken, clearDevTokens } = require('../src/services/emailService');

describe('MEETUP Pulse — Email Verification Flow', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /@verify-test\.example\.com$/i } });
    clearDevTokens();
    await closeSessionStore();
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@verify-test\.example\.com$/i } });
    clearDevTokens();
  });

  it('Registration generates a hashed verification token and does NOT expose it in the public response', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        displayName: 'Verify Tester',
        email: 'tester@verify-test.example.com',
        password: 'Password123!'
      });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.equal(regRes.body.data.isVerified, false);
    assert.equal(regRes.body.data.verificationToken, undefined);
    assert.equal(regRes.body.data.verificationTokenExpiresAt, undefined);

    // Retrieve raw token from dev/test delivery mechanism
    const rawToken = getDevVerificationToken('tester@verify-test.example.com');
    assert.ok(rawToken, 'Expected dev verification token to be generated');

    // Query database to ensure ONLY the SHA-256 hash is stored, not the raw token
    const dbUser = await User.findOne({ email: 'tester@verify-test.example.com' })
      .select('+verificationToken +verificationTokenExpiresAt');

    assert.ok(dbUser.verificationToken);
    assert.notEqual(dbUser.verificationToken, rawToken, 'Database must store hash, never raw token');
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert.equal(dbUser.verificationToken, expectedHash);
    assert.ok(dbUser.verificationTokenExpiresAt instanceof Date);
    assert.ok(dbUser.verificationTokenExpiresAt.getTime() > Date.now());
  });

  it('Unverified users cannot log in before verification (403 EMAIL_NOT_VERIFIED)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        displayName: 'Unverified Seeker',
        email: 'unverified.seeker@verify-test.example.com',
        password: 'Password123!'
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'unverified.seeker@verify-test.example.com',
        password: 'Password123!'
      });

    assert.equal(loginRes.status, 403);
    assert.equal(loginRes.body.success, false);
    assert.equal(loginRes.body.error.code, 'EMAIL_NOT_VERIFIED');
    assert.ok(loginRes.body.error.message.includes('verify your email'));
  });

  it('Missing token parameter is rejected with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get('/api/auth/verify-email');

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('Invalid or non-existent token is rejected with 400 INVALID_TOKEN', async () => {
    const res = await request(app).get('/api/auth/verify-email?token=invalid_random_token_12345');

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_TOKEN');
    assert.ok(res.body.error.message.includes('Invalid or already used'));
  });

  it('Expired token is rejected with 400 TOKEN_EXPIRED', async () => {
    const expiredRawToken = 'expired_raw_token_abcdef1234567890';
    const expiredTokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

    // Create user with already-expired token
    await User.create({
      displayName: 'Expired Token User',
      email: 'expired@verify-test.example.com',
      passwordHash: 'hash_abc',
      isVerified: false,
      verificationToken: expiredTokenHash,
      verificationTokenExpiresAt: new Date(Date.now() - 3600000) // 1 hour ago
    });

    const res = await request(app).get(`/api/auth/verify-email?token=${expiredRawToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
    assert.ok(res.body.error.message.includes('expired'));
  });

  it('Valid token verifies the account via GET query parameter, clears tokens, and allows login', async () => {
    // 1. Register
    await request(app)
      .post('/api/auth/register')
      .send({
        displayName: 'Verified Seeker',
        email: 'verified.seeker@verify-test.example.com',
        password: 'ValidPassword123!'
      });

    const rawToken = getDevVerificationToken('verified.seeker@verify-test.example.com');
    assert.ok(rawToken);

    // 2. Verify account via GET /api/auth/verify-email?token=...
    const verifyRes = await request(app).get(`/api/auth/verify-email?token=${rawToken}`);

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.data.isVerified, true);
    assert.ok(verifyRes.body.data.message.includes('successfully verified'));

    // 3. Confirm in database that tokens are completely cleared and isVerified is true
    const updatedUser = await User.findOne({ email: 'verified.seeker@verify-test.example.com' })
      .select('+verificationToken +verificationTokenExpiresAt');

    assert.equal(updatedUser.isVerified, true);
    assert.equal(updatedUser.verificationToken, null);
    assert.equal(updatedUser.verificationTokenExpiresAt, null);

    // 4. Now login must succeed!
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'verified.seeker@verify-test.example.com',
        password: 'ValidPassword123!'
      });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.equal(loginRes.body.data.isVerified, true);
    assert.ok(loginRes.headers['set-cookie']);
  });

  it('A used token cannot verify the account again (single-use / race-condition protection)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        displayName: 'Single Use User',
        email: 'singleuse@verify-test.example.com',
        password: 'Password123!'
      });

    const rawToken = getDevVerificationToken('singleuse@verify-test.example.com');

    // First verification call succeeds
    const firstRes = await request(app).get(`/api/auth/verify-email?token=${rawToken}`);
    assert.equal(firstRes.status, 200);

    // Second call with same token fails with 400 INVALID_TOKEN
    const secondRes = await request(app).get(`/api/auth/verify-email?token=${rawToken}`);
    assert.equal(secondRes.status, 400);
    assert.equal(secondRes.body.error.code, 'INVALID_TOKEN');
  });

  it('POST /api/auth/verify-email with JSON body also successfully verifies account', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        displayName: 'Post Verifier',
        email: 'post.verify@verify-test.example.com',
        password: 'Password123!'
      });

    const rawToken = getDevVerificationToken('post.verify@verify-test.example.com');

    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: rawToken });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.success, true);
    assert.equal(verifyRes.body.data.isVerified, true);
  });
});
