const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Activity = require('../src/models/Activity');

const organizerId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

// Helper to instantiate test app with specific user context
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

// Default app with no auth (unauthenticated)
const unauthApp = createTestApp(null);
const organizerApp = createTestApp(organizerId);
const strangerApp = createTestApp(strangerId);

function getMockActivityDoc(overrides = {}) {
  const startsAt = new Date(Date.now() + 3600000);
  const endsAt = new Date(Date.now() + 7200000);

  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'Morning Yoga in the Park',
    description: 'Gentle morning yoga session outdoors. Bring a mat and water.',
    category: 'wellness',
    organizerId,
    startsAt,
    endsAt,
    location: {
      type: 'Point',
      coordinates: [-73.97, 40.77]
    },
    displayArea: 'Sheep Meadow, Central Park',
    budget: 0,
    skillLevel: 'all-levels',
    capacity: 15,
    placesFilled: 0,
    approvalRequired: true,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() {
      return { ...this };
    },
    async save() {
      return this;
    },
    ...overrides
  };
}

// ==========================================
// 1. GET /api/activities (Discovery)
// ==========================================

test('GET /api/activities returns 400 when lat is provided without lng', async () => {
  const res = await request(unauthApp)
    .get('/api/activities?lat=40.77')
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/activities returns 400 when radiusKm is provided without coordinates', async () => {
  const res = await request(unauthApp)
    .get('/api/activities?radiusKm=10')
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'COORDINATES_REQUIRED');
});

test('GET /api/activities returns 200 with stable pagination and privacy-masked coordinates', async () => {
  const originalFind = Activity.find;
  const originalCount = Activity.countDocuments;

  const sampleDoc = getMockActivityDoc({ status: 'published' });

  Activity.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          exec: async () => [sampleDoc]
        })
      })
    })
  });

  Activity.countDocuments = () => ({
    exec: async () => 1
  });

  const res = await request(unauthApp)
    .get('/api/activities?lat=40.77&lng=-73.97&radiusKm=3')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.activities));
  assert.equal(res.body.data.activities.length, 1);
  assert.equal(res.body.data.pagination.page, 1);
  assert.equal(res.body.data.pagination.total, 1);
  assert.equal(res.body.data.search.locationApplied, true);

  // Verifies privacy rule: public discovery masks exact coordinates
  const act = res.body.data.activities[0];
  assert.equal(act.location.coordinates, null);
  assert.equal(act.location.isPrecise, false);
  assert.equal(act.displayArea, 'Sheep Meadow, Central Park');

  Activity.find = originalFind;
  Activity.countDocuments = originalCount;
});

// ==========================================
// 2. POST /api/activities (Create Draft)
// ==========================================

test('POST /api/activities returns 401 when unauthenticated', async () => {
  const res = await request(unauthApp)
    .post('/api/activities')
    .send({ title: 'Test' })
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/activities returns 400 when protected fields are injected', async () => {
  const payload = {
    title: 'Sunset Bouldering',
    description: 'Outdoor rock climbing session in the park.',
    category: 'outdoor',
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park Boulders',
    capacity: 10,
    organizerId: '65f123456789abcdef123456', // Protected field!
    status: 'published'                     // Protected field!
  };

  const res = await request(organizerApp)
    .post('/api/activities')
    .send(payload)
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/activities creates draft activity with session organizerId', async () => {
  const originalSave = Activity.prototype.save;
  Activity.prototype.save = async function () {
    return this;
  };

  const payload = {
    title: 'Sunset Bouldering',
    description: 'Outdoor rock climbing session in the park.',
    category: 'outdoor',
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park Boulders',
    capacity: 10
  };

  const res = await request(organizerApp)
    .post('/api/activities')
    .send(payload)
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'draft');
  assert.equal(res.body.data.organizerId.toString(), organizerId.toString());
  assert.equal(res.body.data.placesFilled, 0);

  Activity.prototype.save = originalSave;
});

// ==========================================
// 3. GET /api/activities/:id (Details)
// ==========================================

test('GET /api/activities/:id returns 400 for malformed ObjectId', async () => {
  const res = await request(unauthApp)
    .get('/api/activities/not-a-valid-id')
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INVALID_ID');
});

test('GET /api/activities/:id returns 404 when activity not found', async () => {
  const originalFindById = Activity.findById;
  Activity.findById = () => ({
    exec: async () => null
  });

  const validId = new mongoose.Types.ObjectId();
  const res = await request(unauthApp)
    .get(`/api/activities/${validId}`)
    .expect(404);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'ACTIVITY_NOT_FOUND');

  Activity.findById = originalFindById;
});

test('GET /api/activities/:id reveals precise coordinates to organizer only', async () => {
  const originalFindById = Activity.findById;
  const mockDoc = getMockActivityDoc();
  Activity.findById = () => ({
    exec: async () => mockDoc
  });

  // Stranger request: coordinates withheld
  const strangerRes = await request(strangerApp)
    .get(`/api/activities/${mockDoc._id}`)
    .expect(200);
  assert.equal(strangerRes.body.data.location.coordinates, null);
  assert.equal(strangerRes.body.data.location.isPrecise, false);

  // Organizer request: coordinates revealed
  const organizerRes = await request(organizerApp)
    .get(`/api/activities/${mockDoc._id}`)
    .expect(200);
  assert.deepEqual(organizerRes.body.data.location.coordinates, [-73.97, 40.77]);
  assert.equal(organizerRes.body.data.location.isPrecise, true);

  Activity.findById = originalFindById;
});

// ==========================================
// 4. PATCH /api/activities/:id (Update)
// ==========================================

test('PATCH /api/activities/:id returns 401 when unauthenticated', async () => {
  const validId = new mongoose.Types.ObjectId();
  const res = await request(unauthApp)
    .patch(`/api/activities/${validId}`)
    .send({ title: 'New Title' })
    .expect(401);

  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('PATCH /api/activities/:id returns 403 when user is not the organizer', async () => {
  const originalFindById = Activity.findById;
  const mockDoc = getMockActivityDoc();
  Activity.findById = () => ({
    exec: async () => mockDoc
  });

  const res = await request(strangerApp)
    .patch(`/api/activities/${mockDoc._id}`)
    .send({ title: 'Hijacked Title' })
    .expect(403);

  assert.equal(res.body.error.code, 'FORBIDDEN');

  Activity.findById = originalFindById;
});

test('PATCH /api/activities/:id allows organizer to update permitted fields', async () => {
  const originalFindById = Activity.findById;
  const mockDoc = getMockActivityDoc();
  Activity.findById = () => ({
    exec: async () => mockDoc
  });

  const res = await request(organizerApp)
    .patch(`/api/activities/${mockDoc._id}`)
    .send({ title: 'Updated Morning Yoga Session' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.title, 'Updated Morning Yoga Session');

  Activity.findById = originalFindById;
});

// ==========================================
// 5. POST /api/activities/:id/publish (Publish)
// ==========================================

test('POST /api/activities/:id/publish enforces organizer ownership and draft state', async () => {
  const originalFindById = Activity.findById;
  const mockDoc = getMockActivityDoc({ status: 'draft' });
  Activity.findById = () => ({
    exec: async () => mockDoc
  });

  // Non-organizer fails with 403
  const strangerRes = await request(strangerApp)
    .post(`/api/activities/${mockDoc._id}/publish`)
    .expect(403);
  assert.equal(strangerRes.body.error.code, 'FORBIDDEN');

  // Organizer succeeds with 200
  const organizerRes = await request(organizerApp)
    .post(`/api/activities/${mockDoc._id}/publish`)
    .expect(200);
  assert.equal(organizerRes.body.data.status, 'published');

  Activity.findById = originalFindById;
});

// ==========================================
// 6. POST /api/activities/:id/cancel (Cancel)
// ==========================================

test('POST /api/activities/:id/cancel enforces organizer ownership and cancellation', async () => {
  const originalFindById = Activity.findById;
  const mockDoc = getMockActivityDoc({ status: 'published' });
  Activity.findById = () => ({
    exec: async () => mockDoc
  });

  // Non-organizer fails with 403
  const strangerRes = await request(strangerApp)
    .post(`/api/activities/${mockDoc._id}/cancel`)
    .expect(403);
  assert.equal(strangerRes.body.error.code, 'FORBIDDEN');

  // Organizer succeeds with 200
  const organizerRes = await request(organizerApp)
    .post(`/api/activities/${mockDoc._id}/cancel`)
    .expect(200);
  assert.equal(organizerRes.body.data.status, 'cancelled');

  Activity.findById = originalFindById;
});

// ==========================================
// 7. Authentication Contract Compatibility
// ==========================================

test('POST /api/activities supports backward compatibility with req.user._id', async () => {
  const legacyApp = createApp({
    authMiddleware: (req, res, next) => {
      req.user = { _id: organizerId };
      next();
    }
  });

  const originalSave = Activity.prototype.save;
  Activity.prototype.save = async function () {
    return this;
  };

  const payload = {
    title: 'Legacy Auth Activity',
    description: 'Testing backward compatibility with _id property.',
    category: 'outdoor',
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    endsAt: new Date(Date.now() + 7200000).toISOString(),
    location: { type: 'Point', coordinates: [-73.968, 40.785] },
    displayArea: 'Central Park Boulders',
    capacity: 10
  };

  const res = await request(legacyApp)
    .post('/api/activities')
    .send(payload)
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.organizerId.toString(), organizerId.toString());

  Activity.prototype.save = originalSave;
});

test('Protected routes reject req.user missing both id and _id with 401 UNAUTHORIZED', async () => {
  const malformedUserApp = createApp({
    authMiddleware: (req, res, next) => {
      req.user = {}; // Missing both id and _id
      const { requireAuth } = require('../src/middleware/auth.integration');
      return requireAuth(req, res, next);
    }
  });

  const res = await request(malformedUserApp)
    .post('/api/activities')
    .send({ title: 'Should fail' })
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});
