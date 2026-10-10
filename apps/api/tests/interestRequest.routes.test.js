const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const InterestRequest = require('../src/models/InterestRequest');

const userId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

const authApp = createApp({
  authMiddleware: (req, res, next) => {
    req.user = { id: userId.toString() };
    next();
  }
});

const strangerApp = createApp({
  authMiddleware: (req, res, next) => {
    req.user = { id: strangerId.toString() };
    next();
  }
});

const unauthApp = createApp();

function getValidPayload() {
  return {
    category: 'outdoor',
    title: 'Weekend Trail Run',
    timeStart: new Date(Date.now() + 3600000).toISOString(),
    timeEnd: new Date(Date.now() + 7200000).toISOString(),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park North Woods',
    radiusKm: 5,
    maxBudget: 0,
    skillLevel: 'all-levels',
    groupSize: 4
  };
}

test('POST /api/interest-requests returns 401 when unauthenticated', async () => {
  const res = await request(unauthApp)
    .post('/api/interest-requests')
    .send(getValidPayload())
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/interest-requests returns 400 for invalid dates', async () => {
  const invalid = getValidPayload();
  invalid.timeEnd = invalid.timeStart; // timeEnd must be > timeStart

  const res = await request(authApp)
    .post('/api/interest-requests')
    .send(invalid)
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/interest-requests creates active request with session user ID', async () => {
  const payload = getValidPayload();
  const mockId = new mongoose.Types.ObjectId();

  const originalSave = InterestRequest.prototype.save;
  InterestRequest.prototype.save = async function () {
    this._id = mockId;
    return this;
  };

  const res = await request(authApp)
    .post('/api/interest-requests')
    .send(payload)
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'active');
  assert.equal(res.body.data.userId.toString(), userId.toString());
  assert.equal(res.body.data.location.isPrecise, true); // Owner sees precise

  InterestRequest.prototype.save = originalSave;
});

test('GET /api/interest-requests lists authenticated user requests with pagination', async () => {
  const originalFind = InterestRequest.find;
  const originalCount = InterestRequest.countDocuments;

  InterestRequest.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          exec: async () => [
            {
              _id: new mongoose.Types.ObjectId(),
              userId,
              category: 'outdoor',
              status: 'active',
              displayArea: 'Central Park',
              location: { type: 'Point', coordinates: [-73.968, 40.785] }
            }
          ]
        })
      })
    })
  });

  InterestRequest.countDocuments = () => ({
    exec: async () => 1
  });

  const res = await request(authApp)
    .get('/api/interest-requests?page=1&limit=10')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.requests.length, 1);
  assert.equal(res.body.data.pagination.total, 1);

  InterestRequest.find = originalFind;
  InterestRequest.countDocuments = originalCount;
});

test('GET /api/interest-requests/:id returns 400 for malformed ObjectId', async () => {
  const res = await request(authApp)
    .get('/api/interest-requests/invalid-id')
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INVALID_ID');
});

test('GET /api/interest-requests/:id redacts coordinates for non-owner', async () => {
  const reqId = new mongoose.Types.ObjectId();
  const originalFindById = InterestRequest.findById;

  InterestRequest.findById = () => ({
    populate: () => ({
      exec: async () => ({
        _id: reqId,
        userId: { _id: userId, displayName: 'Original Owner' },
        category: 'outdoor',
        displayArea: 'Central Park',
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        status: 'active'
      })
    })
  });

  const res = await request(strangerApp)
    .get(`/api/interest-requests/${reqId}`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.location.coordinates, null);
  assert.equal(res.body.data.location.isPrecise, false);

  InterestRequest.findById = originalFindById;
});

test('PATCH /api/interest-requests/:id returns 403 when non-owner updates', async () => {
  const reqId = new mongoose.Types.ObjectId();
  const originalFindById = InterestRequest.findById;

  InterestRequest.findById = () => ({
    exec: async () => ({
      _id: reqId,
      userId,
      status: 'active'
    })
  });

  const res = await request(strangerApp)
    .patch(`/api/interest-requests/${reqId}`)
    .send({ title: 'Stranger Title' })
    .expect(403);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  InterestRequest.findById = originalFindById;
});

test('POST /api/interest-requests/:id/cancel cancels request with ownership enforcement', async () => {
  const reqId = new mongoose.Types.ObjectId();
  const originalFindById = InterestRequest.findById;
  const originalFindOneAndUpdate = InterestRequest.findOneAndUpdate;

  InterestRequest.findById = () => ({
    exec: async () => ({
      _id: reqId,
      userId,
      status: 'active'
    })
  });

  InterestRequest.findOneAndUpdate = () => ({
    exec: async () => ({
      _id: reqId,
      userId,
      status: 'withdrawn'
    })
  });

  const res = await request(authApp)
    .post(`/api/interest-requests/${reqId}/cancel`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'withdrawn');

  InterestRequest.findById = originalFindById;
  InterestRequest.findOneAndUpdate = originalFindOneAndUpdate;
});
