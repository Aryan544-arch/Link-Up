process.env.NODE_ENV = 'test';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');
const User = require('../src/models/User');

describe('MEETUP Pulse — User Profile and Preferences API', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /@profile-test\.example\.com$/i } });
    await closeSessionStore();
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@profile-test\.example\.com$/i } });
  });

  // Helper to create and log in a verified user, returning { user, cookie }
  async function createAndLoginUser(emailPrefix, displayName = 'Test User') {
    const email = `${emailPrefix}@profile-test.example.com`;
    const password = 'Password123!';
    const user = await User.create({
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      isVerified: true,
      searchRadiusKm: 3,
      interests: ['hiking']
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    return {
      user,
      cookie: loginRes.headers['set-cookie']
    };
  }

  it('Unauthenticated requests to PATCH /api/users/me receive 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .send({ displayName: 'New Name' });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('Authenticated user can update allowed profile fields (displayName, searchRadiusKm, preferredArea, interests)', async () => {
    const { user, cookie } = await createAndLoginUser('user.update', 'Original Name');

    const updateRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({
        displayName: 'Updated Name',
        searchRadiusKm: 15.5,
        preferredArea: 'Downtown Park',
        interests: ['tennis', 'cycling', 'tennis'] // duplicate tag should be deduplicated
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.success, true);
    assert.equal(updateRes.body.data.id, user._id.toString());
    assert.equal(updateRes.body.data.displayName, 'Updated Name');
    assert.equal(updateRes.body.data.searchRadiusKm, 15.5);
    assert.equal(updateRes.body.data.preferredArea, 'Downtown Park');
    assert.deepEqual(updateRes.body.data.interests, ['tennis', 'cycling']);

    // Response must not expose credentials
    assert.equal(updateRes.body.data.passwordHash, undefined);
    assert.equal(updateRes.body.data.verificationToken, undefined);

    // Verify database reflection
    const dbUser = await User.findById(user._id);
    assert.equal(dbUser.displayName, 'Updated Name');
    assert.equal(dbUser.searchRadiusKm, 15.5);
    assert.equal(dbUser.preferredArea, 'Downtown Park');
    assert.deepEqual(dbUser.interests, ['tennis', 'cycling']);
  });

  it('Invalid display name (< 2 chars or > 50 chars) is rejected with 400 VALIDATION_ERROR', async () => {
    const { cookie } = await createAndLoginUser('user.invalidname');

    // Too short
    const shortRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'X' });

    assert.equal(shortRes.status, 400);
    assert.equal(shortRes.body.success, false);
    assert.equal(shortRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(shortRes.body.error.fields.displayName);

    // Too long
    const longRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ displayName: 'Z'.repeat(51) });

    assert.equal(longRes.status, 400);
    assert.equal(longRes.body.error.code, 'VALIDATION_ERROR');
  });

  it('Invalid search radius (< 0.5 km or > 50 km) is rejected with 400 VALIDATION_ERROR', async () => {
    const { cookie } = await createAndLoginUser('user.invalidradius');

    // Below 0.5 km
    const lowRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ searchRadiusKm: 0.1 });

    assert.equal(lowRes.status, 400);
    assert.equal(lowRes.body.error.code, 'VALIDATION_ERROR');
    assert.ok(lowRes.body.error.fields.searchRadiusKm);

    // Above 50 km
    const highRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({ searchRadiusKm: 75 });

    assert.equal(highRes.status, 400);
    assert.equal(highRes.body.error.code, 'VALIDATION_ERROR');
  });

  it('Protected and unknown fields are strictly rejected and cannot be modified', async () => {
    const { user, cookie } = await createAndLoginUser('user.protected');

    // Attempting to change email or passwordHash
    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({
        email: 'hacked@profile-test.example.com',
        isVerified: false,
        passwordHash: 'injected_hash',
        verificationToken: 'injected_token'
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');

    // Verify in database that email and passwordHash were not altered
    const dbUser = await User.findById(user._id).select('+passwordHash');
    assert.equal(dbUser.email, 'user.protected@profile-test.example.com');
    assert.notEqual(dbUser.passwordHash, 'injected_hash');
    assert.equal(dbUser.isVerified, true);
  });

  it('Empty update requests ({}) are rejected with 400 VALIDATION_ERROR', async () => {
    const { cookie } = await createAndLoginUser('user.emptybody');

    const res = await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({});

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('User A cannot modify User B profile even if passing target userId in body or params', async () => {
    const userA = await createAndLoginUser('usera', 'User A');
    const userB = await createAndLoginUser('userb', 'User B Original');

    // User A attempts to pass User B's ID in request body
    const attackRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', userA.cookie)
      .send({
        displayName: 'Attacked Name',
        userId: userB.user._id.toString()
      });

    // Rejected by strict schema because userId is unknown/disallowed field
    assert.equal(attackRes.status, 400);

    // Verify User B's profile was untouched
    const freshUserB = await User.findById(userB.user._id);
    assert.equal(freshUserB.displayName, 'User B Original');

    // Valid update by User A only affects User A
    const legitimateRes = await request(app)
      .patch('/api/users/me')
      .set('Cookie', userA.cookie)
      .send({
        displayName: 'User A Updated'
      });

    assert.equal(legitimateRes.status, 200);
    assert.equal(legitimateRes.body.data.id, userA.user._id.toString());
    assert.equal(legitimateRes.body.data.displayName, 'User A Updated');

    // User B still completely unchanged
    const freshUserB2 = await User.findById(userB.user._id);
    assert.equal(freshUserB2.displayName, 'User B Original');
  });

  it('GET /api/auth/me still works and reflects the updated profile data', async () => {
    const { user, cookie } = await createAndLoginUser('user.authme', 'Before Update');

    // 1. Update profile via PATCH /api/users/me
    await request(app)
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .send({
        displayName: 'After Update',
        searchRadiusKm: 5,
        preferredArea: 'Sector 22'
      });

    // 2. Query GET /api/auth/me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(meRes.body.data.id, user._id.toString());
    assert.equal(meRes.body.data.displayName, 'After Update');
    assert.equal(meRes.body.data.searchRadiusKm, 5);
    assert.equal(meRes.body.data.preferredArea, 'Sector 22');
    assert.equal(meRes.body.data.passwordHash, undefined);
  });
});
