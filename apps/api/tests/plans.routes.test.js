const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const InterestRequest = require('../src/models/InterestRequest');
const Proposal = require('../src/models/Proposal');

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
const legacyUserApp = createTestApp({ _id: testUserId });
const emptyUserApp = createTestApp({});

function createQueryMock(data = []) {
  const q = {
    sort: () => q,
    limit: () => q,
    skip: () => q,
    populate: () => q,
    exec: async () => data
  };
  return q;
}

function mockEmptyDatabase() {
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  Activity.find = () => createQueryMock([]);
  JoinRequest.find = () => createQueryMock([]);
  InterestRequest.find = () => createQueryMock([]);
  Proposal.find = () => createQueryMock([]);

  return () => {
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  };
}

test('GET /api/me/plans returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const res = await request(unauthApp)
    .get('/api/me/plans')
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/me/plans returns 401 UNAUTHORIZED when req.user lacks both id and _id', async () => {
  const res = await request(emptyUserApp)
    .get('/api/me/plans')
    .expect(401);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/me/plans returns 200 with standard envelope and all 5 plan groups', async () => {
  const restoreMocks = mockEmptyDatabase();

  try {
    const res = await request(authApp)
      .get('/api/me/plans')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data);
    assert.ok(Array.isArray(res.body.data.organized));
    assert.ok(Array.isArray(res.body.data.joined));
    assert.ok(Array.isArray(res.body.data.pendingRequests));
    assert.ok(Array.isArray(res.body.data.interestRequests));
    assert.ok(Array.isArray(res.body.data.proposals));
    assert.ok(res.body.data.summary);
    assert.equal(typeof res.body.data.summary.totalPlansCount, 'number');
  } finally {
    restoreMocks();
  }
});

test('GET /api/me/plans supports backward compatibility with req.user._id', async () => {
  const restoreMocks = mockEmptyDatabase();

  try {
    const res = await request(legacyUserApp)
      .get('/api/me/plans')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(res.body.data);
  } finally {
    restoreMocks();
  }
});

test('GET /api/me/plans returns masked coordinates for joined activities and unmasked for organized activities', async () => {
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  const mockOrganized = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Organized Yoga',
    description: 'Outdoor yoga class.',
    category: 'wellness',
    organizerId: testUserId,
    startsAt: new Date(Date.now() + 3600000),
    endsAt: new Date(Date.now() + 7200000),
    location: { type: 'Point', coordinates: [-73.97, 40.77] },
    displayArea: 'Central Park Meadow',
    capacity: 10,
    placesFilled: 1,
    budget: 0,
    skillLevel: 'all-levels',
    approvalRequired: true,
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() { return { ...this }; }
  };

  const otherOrganizerId = new mongoose.Types.ObjectId();
  const mockJoinedActivity = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Joined Trail Run',
    description: 'Trail run with others.',
    category: 'outdoor',
    organizerId: otherOrganizerId,
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 90000000),
    location: { type: 'Point', coordinates: [-73.96, 40.78] },
    displayArea: 'North Woods',
    capacity: 5,
    placesFilled: 2,
    budget: 0,
    skillLevel: 'all-levels',
    approvalRequired: true,
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() { return { ...this }; }
  };

  const mockJoinedReq = {
    _id: new mongoose.Types.ObjectId(),
    userId: testUserId,
    status: 'approved',
    activityId: mockJoinedActivity,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  Activity.find = () => createQueryMock([mockOrganized]);
  JoinRequest.find = () => createQueryMock([mockJoinedReq]);
  InterestRequest.find = () => createQueryMock([]);
  Proposal.find = () => createQueryMock([]);

  try {
    const res = await request(authApp)
      .get('/api/me/plans')
      .expect(200);

    assert.equal(res.body.success, true);

    // Organized activity: precise coordinates retained
    const orgAct = res.body.data.organized[0];
    assert.equal(orgAct.location.isPrecise, true);
    assert.deepEqual(orgAct.location.coordinates, [-73.97, 40.77]);

    // Joined activity: precise coordinates withheld (null)
    const joinedItem = res.body.data.joined[0];
    assert.equal(joinedItem.activity.location.isPrecise, false);
    assert.equal(joinedItem.activity.location.coordinates, null);
    assert.equal(joinedItem.activity.displayArea, 'North Woods');
  } finally {
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  }
});
