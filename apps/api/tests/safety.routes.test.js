const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { Report } = require('../src/models/Report');
const Block = require('../src/models/Block');
const User = require('../src/models/User');
const Activity = require('../src/models/Activity');

const testUserId = new mongoose.Types.ObjectId();
const targetUserId = new mongoose.Types.ObjectId();
const targetActivityId = new mongoose.Types.ObjectId();

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

test('Report model validates targetType, reason, and status', () => {
  const report = new Report({
    reporterId: testUserId,
    targetType: 'user',
    targetId: targetUserId,
    reason: 'spam',
    details: 'Posting repetitive links'
  });

  const err = report.validateSync();
  assert.equal(err, undefined);
  assert.equal(report.status, 'pending');

  const invalidReport = new Report({
    reporterId: testUserId,
    targetType: 'invalid_target',
    targetId: targetUserId,
    reason: 'invalid_reason'
  });
  const errInvalid = invalidReport.validateSync();
  assert.ok(errInvalid);
  assert.ok(errInvalid.errors.targetType);
  assert.ok(errInvalid.errors.reason);
});

test('Block model validates blocker and blocked user IDs', () => {
  const block = new Block({
    blockerId: testUserId,
    blockedUserId: targetUserId,
    reason: 'Harassment'
  });

  const err = block.validateSync();
  assert.equal(err, undefined);
  assert.equal(block.reason, 'Harassment');

  const emptyBlock = new Block({});
  const emptyErr = emptyBlock.validateSync();
  assert.ok(emptyErr);
  assert.ok(emptyErr.errors.blockerId);
  assert.ok(emptyErr.errors.blockedUserId);
});

test('POST /api/reports returns 401 when unauthenticated', async () => {
  const res = await request(unauthApp)
    .post('/api/reports')
    .send({
      targetType: 'user',
      targetId: targetUserId.toString(),
      reason: 'spam'
    });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/reports rejects self-reporting with 400 CANNOT_REPORT_SELF', async () => {
  const res = await request(authApp)
    .post('/api/reports')
    .send({
      targetType: 'user',
      targetId: testUserId.toString(),
      reason: 'harassment'
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'CANNOT_REPORT_SELF');
});

test('POST /api/reports returns 404 when reported target does not exist', async () => {
  const origFindById = User.findById;
  User.findById = () => ({
    exec: async () => null
  });

  try {
    const res = await request(authApp)
      .post('/api/reports')
      .send({
        targetType: 'user',
        targetId: targetUserId.toString(),
        reason: 'spam'
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  } finally {
    User.findById = origFindById;
  }
});

test('POST /api/reports successfully creates report and returns 201', async () => {
  const origFindById = Activity.findById;
  const mockActivity = new Activity({
    _id: targetActivityId,
    title: 'Flagged Activity',
    organizerId: targetUserId,
    category: 'sports',
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 90000000),
    location: {
      type: 'Point',
      coordinates: [-73.985, 40.748],
      displayArea: 'Midtown'
    },
    capacity: 10
  });

  Activity.findById = () => ({
    exec: async () => mockActivity
  });

  const origReportSave = Report.prototype.save;
  Report.prototype.save = async function () {
    return this;
  };

  try {
    const res = await request(authApp)
      .post('/api/reports')
      .send({
        targetType: 'activity',
        targetId: targetActivityId.toString(),
        reason: 'safety_concern',
        details: 'Dangerous location'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.targetType, 'activity');
    assert.equal(res.body.data.reason, 'safety_concern');
    assert.equal(res.body.data.status, 'pending');
  } finally {
    Activity.findById = origFindById;
    Report.prototype.save = origReportSave;
  }
});

test('POST /api/blocks returns 401 when unauthenticated', async () => {
  const res = await request(unauthApp)
    .post('/api/blocks')
    .send({
      blockedUserId: targetUserId.toString()
    });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('POST /api/blocks rejects blocking oneself with 400 CANNOT_BLOCK_SELF', async () => {
  const res = await request(authApp)
    .post('/api/blocks')
    .send({
      blockedUserId: testUserId.toString()
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'CANNOT_BLOCK_SELF');
});

test('POST /api/blocks returns 404 when target user does not exist', async () => {
  const origFindById = User.findById;
  User.findById = () => ({
    exec: async () => null
  });

  try {
    const res = await request(authApp)
      .post('/api/blocks')
      .send({
        blockedUserId: targetUserId.toString()
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'USER_NOT_FOUND');
  } finally {
    User.findById = origFindById;
  }
});

test('POST /api/blocks successfully blocks user and returns 201', async () => {
  const origFindById = User.findById;
  User.findById = () => ({
    exec: async () => ({ _id: targetUserId })
  });

  const origBlockSave = Block.prototype.save;
  Block.prototype.save = async function () {
    return this;
  };

  try {
    const res = await request(authApp)
      .post('/api/blocks')
      .send({
        blockedUserId: targetUserId.toString(),
        reason: 'Harassing messages'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.blockedUserId, targetUserId.toString());
  } finally {
    User.findById = origFindById;
    Block.prototype.save = origBlockSave;
  }
});

test('GET /api/blocks returns list of blocked user IDs', async () => {
  const origFind = Block.find;
  Block.find = () => ({
    select: () => ({
      exec: async () => [{ blockedUserId: targetUserId }]
    })
  });

  try {
    const res = await request(authApp).get('/api/blocks');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.blockedUserIds, [targetUserId.toString()]);
  } finally {
    Block.find = origFind;
  }
});

test('DELETE /api/blocks/:userId successfully unblocks user', async () => {
  const origFindOneAndDelete = Block.findOneAndDelete;
  Block.findOneAndDelete = () => ({
    exec: async () => ({ _id: new mongoose.Types.ObjectId() })
  });

  try {
    const res = await request(authApp).delete(`/api/blocks/${targetUserId.toString()}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.unblocked, true);
  } finally {
    Block.findOneAndDelete = origFindOneAndDelete;
  }
});

test('findActivities excludes activities from blocked organizers for authenticated user', async () => {
  const activityService = require('../src/services/activity.service');
  const safetyService = require('../src/services/safety.service');

  const origGetBlocked = safetyService.getBlockedUserIds;
  safetyService.getBlockedUserIds = async () => [targetUserId.toString()];

  const origFind = Activity.find;
  const origCount = Activity.countDocuments;
  let capturedFilter = null;

  Activity.find = (f) => {
    capturedFilter = f;
    return {
      sort: () => ({
        skip: () => ({
          limit: () => ({
            exec: async () => []
          })
        })
      })
    };
  };
  Activity.countDocuments = () => ({
    exec: async () => 0
  });

  const origReadyState = Activity.db.readyState;
  Activity.db.readyState = 1;

  try {
    await activityService.findActivities({
      query: {},
      currentUserId: testUserId.toString()
    });

    assert.ok(capturedFilter);
    assert.deepEqual(capturedFilter.organizerId, { $nin: [targetUserId.toString()] });
  } finally {
    Activity.db.readyState = origReadyState;
    safetyService.getBlockedUserIds = origGetBlocked;
    Activity.find = origFind;
    Activity.countDocuments = origCount;
  }
});

