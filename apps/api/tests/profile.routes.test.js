const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const User = require('../src/models/User');

const testUserId = new mongoose.Types.ObjectId();

function createTestApp(userObj = null) {
  if (!userObj) {
    return createApp();
  }

  return createApp({
    authMiddleware: (req, res, next) => {
      req.user = userObj;
      next();
    }
  });
}

const unauthApp = createTestApp(null);
const authApp = createTestApp({ id: testUserId.toString() });

function mockUserFindById(userDoc) {
  const origFindById = User.findById;
  User.findById = (id) => ({
    exec: async () => userDoc
  });
  return () => {
    User.findById = origFindById;
  };
}

test('PATCH /api/me/profile returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const res = await request(unauthApp)
    .patch('/api/me/profile')
    .send({ displayName: 'New Name' });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('PATCH /api/me/profile rejects invalid input with 400 VALIDATION_ERROR', async () => {
  const res = await request(authApp)
    .patch('/api/me/profile')
    .send({ displayName: 'X' }); // Too short

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/me/profile successfully updates profile and excludes password', async () => {
  const mockUser = new User({
    _id: testUserId,
    email: 'profiletest@example.com',
    password: 'Password123!',
    displayName: 'Original Name',
    bio: 'Old bio'
  });
  mockUser.save = async () => mockUser;

  const restore = mockUserFindById(mockUser);
  try {
    const res = await request(authApp)
      .patch('/api/me/profile')
      .send({
        displayName: 'Updated Name',
        bio: 'Updated bio',
        gender: 'prefer-not-to-say'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.displayName, 'Updated Name');
    assert.equal(res.body.data.bio, 'Updated bio');
    assert.equal(res.body.data.gender, 'prefer-not-to-say');
    assert.equal(res.body.data.password, undefined);
  } finally {
    restore();
  }
});

test('GET /api/me/preferences returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const res = await request(unauthApp).get('/api/me/preferences');

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/me/preferences returns current user preferences', async () => {
  const mockUser = new User({
    _id: testUserId,
    email: 'prefstest@example.com',
    password: 'Password123!',
    displayName: 'Prefs User',
    interests: ['running', 'hiking'],
    searchRadiusKm: 5,
    preferredLocation: {
      displayArea: 'Lake District',
      coordinates: [-73.98, 40.75]
    },
    notificationPreferences: {
      inApp: true,
      email: true,
      push: false
    }
  });

  const restore = mockUserFindById(mockUser);
  try {
    const res = await request(authApp).get('/api/me/preferences');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.interests, ['running', 'hiking']);
    assert.equal(res.body.data.searchRadiusKm, 5);
    assert.equal(res.body.data.preferredLocation.displayArea, 'Lake District');
    assert.deepEqual(res.body.data.preferredLocation.coordinates, [-73.98, 40.75]);
    assert.equal(res.body.data.notificationPreferences.email, true);
  } finally {
    restore();
  }
});

test('PATCH /api/me/preferences returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const res = await request(unauthApp)
    .patch('/api/me/preferences')
    .send({ searchRadiusKm: 10 });

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('PATCH /api/me/preferences rejects invalid category with 400 VALIDATION_ERROR', async () => {
  const res = await request(authApp)
    .patch('/api/me/preferences')
    .send({ interests: ['underwater-basket-weaving'] });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/me/preferences rejects radius out of bounds', async () => {
  const resLow = await request(authApp)
    .patch('/api/me/preferences')
    .send({ searchRadiusKm: 0 });

  assert.equal(resLow.status, 400);

  const resHigh = await request(authApp)
    .patch('/api/me/preferences')
    .send({ searchRadiusKm: 51 });

  assert.equal(resHigh.status, 400);
});

test('PATCH /api/me/preferences updates preferences successfully', async () => {
  const mockUser = new User({
    _id: testUserId,
    email: 'prefstest2@example.com',
    password: 'Password123!',
    displayName: 'Prefs User 2'
  });
  mockUser.save = async () => mockUser;

  const restore = mockUserFindById(mockUser);
  try {
    const res = await request(authApp)
      .patch('/api/me/preferences')
      .send({
        interests: ['nature', 'social'],
        searchRadiusKm: 10,
        preferredLocation: {
          displayArea: 'Central Park',
          coordinates: [-73.966, 40.781]
        },
        notificationPreferences: {
          inApp: true,
          email: true,
          push: false
        }
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.interests, ['nature', 'social']);
    assert.equal(res.body.data.searchRadiusKm, 10);
    assert.equal(res.body.data.preferredLocation.displayArea, 'Central Park');
  } finally {
    restore();
  }
});
