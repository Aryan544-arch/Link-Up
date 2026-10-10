const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');

const organizerId = new mongoose.Types.ObjectId();
const applicantId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

function createTestApp(userId = null) {
  if (!userId) {
    return createApp();
  }

  return createApp({
    authMiddleware: (req, res, next) => {
      req.user = { id: userId.toString() };
      next();
    },
    optionalAuthMiddleware: (req, res, next) => {
      req.user = { id: userId.toString() };
      next();
    }
  });
}

const unauthApp = createTestApp(null);
const organizerApp = createTestApp(organizerId);
const applicantApp = createTestApp(applicantId);
const strangerApp = createTestApp(strangerId);

function getMockActivity(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    organizerId,
    title: 'Trail Hike',
    status: 'published',
    startsAt: new Date(Date.now() + 3600000),
    capacity: 10,
    placesFilled: 2,
    approvalRequired: true,
    ...overrides
  };
}

function getMockJoinRequest(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    activityId: new mongoose.Types.ObjectId(),
    userId: applicantId,
    status: 'pending',
    note: 'Excited to join!',
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() {
      return this;
    },
    ...overrides
  };
}

// ==========================================
// 1. POST /api/activities/:id/join
// ==========================================

test('POST /api/activities/:id/join returns 401 when unauthenticated', async () => {
  const validId = new mongoose.Types.ObjectId();
  const res = await request(unauthApp)
    .post(`/api/activities/${validId}/join`)
    .send({})
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/activities/:id/join returns 400 for invalid ObjectId', async () => {
  const res = await request(applicantApp)
    .post('/api/activities/invalid-id/join')
    .send({})
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INVALID_ID');
});

test('POST /api/activities/:id/join returns 201 when applicant requests to join', async () => {
  const mockActivity = getMockActivity();
  const originalFindAct = Activity.findById;
  const originalFindOneReq = JoinRequest.findOne;
  const originalSaveReq = JoinRequest.prototype.save;

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  JoinRequest.findOne = () => ({
    exec: async () => null // No duplicate active request
  });

  JoinRequest.prototype.save = async function () {
    return this;
  };

  const res = await request(applicantApp)
    .post(`/api/activities/${mockActivity._id}/join`)
    .send({ note: 'Hi, I would like to join!' })
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'pending');
  assert.equal(res.body.data.userId.toString(), applicantId.toString());

  Activity.findById = originalFindAct;
  JoinRequest.findOne = originalFindOneReq;
  JoinRequest.prototype.save = originalSaveReq;
});

// ==========================================
// 2. GET /api/activities/:id/requests
// ==========================================

test('GET /api/activities/:id/requests returns 403 when non-organizer accesses requests', async () => {
  const mockActivity = getMockActivity();
  const originalFindAct = Activity.findById;

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  const res = await request(strangerApp)
    .get(`/api/activities/${mockActivity._id}/requests`)
    .expect(403);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  Activity.findById = originalFindAct;
});

test('GET /api/activities/:id/requests returns 200 with request list for organizer', async () => {
  const mockActivity = getMockActivity();
  const mockReq = getMockJoinRequest({ activityId: mockActivity._id });

  const originalFindAct = Activity.findById;
  const originalFindReq = JoinRequest.find;
  const originalCountReq = JoinRequest.countDocuments;

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  JoinRequest.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          populate: () => ({
            exec: async () => [mockReq]
          })
        })
      })
    })
  });

  JoinRequest.countDocuments = () => ({
    exec: async () => 1
  });

  const res = await request(organizerApp)
    .get(`/api/activities/${mockActivity._id}/requests`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.requests));
  assert.equal(res.body.data.requests.length, 1);
  assert.equal(res.body.data.pagination.total, 1);

  Activity.findById = originalFindAct;
  JoinRequest.find = originalFindReq;
  JoinRequest.countDocuments = originalCountReq;
});

// ==========================================
// 3. PATCH /api/join-requests/:id
// ==========================================

test('PATCH /api/join-requests/:id returns 400 for invalid decision status', async () => {
  const validId = new mongoose.Types.ObjectId();
  const res = await request(organizerApp)
    .patch(`/api/join-requests/${validId}`)
    .send({ status: 'invalid-status' })
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/join-requests/:id allows organizer to approve pending request', async () => {
  const mockActivity = getMockActivity({ capacity: 5, placesFilled: 2 });
  const mockReq = getMockJoinRequest({ activityId: mockActivity._id });

  const originalFindReq = JoinRequest.findById;
  const originalFindAct = Activity.findById;
  const originalFindOneUpdateAct = Activity.findOneAndUpdate;
  const originalFindOneUpdateReq = JoinRequest.findOneAndUpdate;

  JoinRequest.findById = () => ({
    exec: async () => mockReq
  });

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  Activity.findOneAndUpdate = () => ({
    exec: async () => ({ ...mockActivity, placesFilled: 3 })
  });

  JoinRequest.findOneAndUpdate = () => ({
    exec: async () => ({ ...mockReq, status: 'approved' })
  });

  const res = await request(organizerApp)
    .patch(`/api/join-requests/${mockReq._id}`)
    .send({ status: 'approved' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'approved');

  JoinRequest.findById = originalFindReq;
  Activity.findById = originalFindAct;
  Activity.findOneAndUpdate = originalFindOneUpdateAct;
  JoinRequest.findOneAndUpdate = originalFindOneUpdateReq;
});

test('PATCH /api/join-requests/:id returns 403 when non-organizer makes decision', async () => {
  const mockActivity = getMockActivity();
  const mockReq = getMockJoinRequest({ activityId: mockActivity._id });

  const originalFindReq = JoinRequest.findById;
  const originalFindAct = Activity.findById;

  JoinRequest.findById = () => ({
    exec: async () => mockReq
  });

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  const res = await request(strangerApp)
    .patch(`/api/join-requests/${mockReq._id}`)
    .send({ status: 'approved' })
    .expect(403);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  JoinRequest.findById = originalFindReq;
  Activity.findById = originalFindAct;
});

// ==========================================
// 4. POST /api/join-requests/:id/cancel
// ==========================================

test('POST /api/join-requests/:id/cancel allows applicant to cancel own request', async () => {
  const mockReq = getMockJoinRequest({ userId: applicantId, status: 'pending' });

  const originalFindReq = JoinRequest.findById;
  const originalFindOneAndUpdate = JoinRequest.findOneAndUpdate;
  JoinRequest.findById = () => ({
    exec: async () => mockReq
  });
  JoinRequest.findOneAndUpdate = () => ({
    exec: async () => mockReq
  });

  const res = await request(applicantApp)
    .post(`/api/join-requests/${mockReq._id}/cancel`)
    .send({ reason: 'Scheduling conflict' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'cancelled');

  JoinRequest.findById = originalFindReq;
  JoinRequest.findOneAndUpdate = originalFindOneAndUpdate;
});

test('POST /api/join-requests/:id/cancel returns 403 when stranger attempts to cancel', async () => {
  const mockReq = getMockJoinRequest({ userId: applicantId, status: 'pending' });

  const originalFindReq = JoinRequest.findById;
  JoinRequest.findById = () => ({
    exec: async () => mockReq
  });

  const res = await request(strangerApp)
    .post(`/api/join-requests/${mockReq._id}/cancel`)
    .send({})
    .expect(403);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  JoinRequest.findById = originalFindReq;
});

// ==========================================
// 5. Authentication Contract Compatibility
// ==========================================

test('POST /api/activities/:id/join supports backward compatibility with req.user._id', async () => {
  const legacyApp = createApp({
    authMiddleware: (req, res, next) => {
      req.user = { _id: applicantId };
      next();
    }
  });

  const mockActivity = getMockActivity();
  const originalFindAct = Activity.findById;
  const originalFindOneReq = JoinRequest.findOne;
  const originalSaveReq = JoinRequest.prototype.save;

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  JoinRequest.findOne = () => ({
    exec: async () => null
  });

  JoinRequest.prototype.save = async function () {
    return this;
  };

  const res = await request(legacyApp)
    .post(`/api/activities/${mockActivity._id}/join`)
    .send({ note: 'Legacy user id test' })
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.userId.toString(), applicantId.toString());

  Activity.findById = originalFindAct;
  JoinRequest.findOne = originalFindOneReq;
  JoinRequest.prototype.save = originalSaveReq;
});

test('Join request protected routes reject req.user missing both id and _id with 401 UNAUTHORIZED', async () => {
  const emptyUserApp = createApp({
    authMiddleware: (req, res, next) => {
      req.user = {}; // Missing both id and _id
      const { requireAuth } = require('../src/middleware/auth.integration');
      return requireAuth(req, res, next);
    }
  });

  const validId = new mongoose.Types.ObjectId();
  const res = await request(emptyUserApp)
    .post(`/api/activities/${validId}/join`)
    .send({})
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});
