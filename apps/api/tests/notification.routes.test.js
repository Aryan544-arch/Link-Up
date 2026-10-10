const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Notification = require('../src/models/Notification');

const testUserId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

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

test('Notification model validates required fields and allowed types', () => {
  const notif = new Notification({
    recipientId: testUserId,
    type: 'JOIN_REQUEST_RECEIVED',
    title: 'New Join Request',
    message: 'User Alice requested to join your activity.'
  });

  const err = notif.validateSync();
  assert.equal(err, undefined);
  assert.equal(notif.readAt, null);
  assert.equal(notif.relatedResourceType, 'none');

  const invalidNotif = new Notification({
    recipientId: testUserId,
    type: 'INVALID_TYPE',
    title: 'Test',
    message: 'Test'
  });
  const errInvalid = invalidNotif.validateSync();
  assert.ok(errInvalid);
  assert.ok(errInvalid.errors.type);
});

test('GET /api/notifications returns 401 UNAUTHORIZED when unauthenticated', async () => {
  const res = await request(unauthApp).get('/api/notifications');

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('GET /api/notifications returns paginated list and unreadCount', async () => {
  const origFind = Notification.find;
  const origCount = Notification.countDocuments;

  const mockNotif = new Notification({
    _id: new mongoose.Types.ObjectId(),
    recipientId: testUserId,
    type: 'JOIN_REQUEST_APPROVED',
    title: 'Approved!',
    message: 'Your join request was approved.',
    readAt: null
  });

  Notification.find = () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          exec: async () => [mockNotif]
        })
      })
    })
  });

  Notification.countDocuments = (q) => ({
    exec: async () => (q.readAt === null ? 1 : 1)
  });

  try {
    const res = await request(authApp).get('/api/notifications?page=1&limit=10');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.items.length, 1);
    assert.equal(res.body.data.unreadCount, 1);
    assert.equal(res.body.data.pagination.page, 1);
    assert.equal(res.body.data.pagination.limit, 10);
  } finally {
    Notification.find = origFind;
    Notification.countDocuments = origCount;
  }
});

test('PATCH /api/notifications/:id/read returns 401 when unauthenticated', async () => {
  const someId = new mongoose.Types.ObjectId();
  const res = await request(unauthApp).patch(`/api/notifications/${someId}/read`);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('PATCH /api/notifications/:id/read returns 400 for invalid ObjectId format', async () => {
  const res = await request(authApp).patch('/api/notifications/invalid-id/read');

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_ID');
});

test('PATCH /api/notifications/:id/read returns 404 when notification does not exist', async () => {
  const nonExistentId = new mongoose.Types.ObjectId();
  const origFindById = Notification.findById;
  Notification.findById = () => ({
    exec: async () => null
  });

  try {
    const res = await request(authApp).patch(`/api/notifications/${nonExistentId}/read`);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOTIFICATION_NOT_FOUND');
  } finally {
    Notification.findById = origFindById;
  }
});

test('PATCH /api/notifications/:id/read returns 403 when user is not the recipient', async () => {
  const notifId = new mongoose.Types.ObjectId();
  const notifDoc = new Notification({
    _id: notifId,
    recipientId: otherUserId, // Not testUserId
    type: 'JOIN_REQUEST_RECEIVED',
    title: 'Secret',
    message: 'Secret for another user'
  });

  const origFindById = Notification.findById;
  Notification.findById = () => ({
    exec: async () => notifDoc
  });

  try {
    const res = await request(authApp).patch(`/api/notifications/${notifId}/read`);

    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  } finally {
    Notification.findById = origFindById;
  }
});

test('PATCH /api/notifications/:id/read successfully marks notification as read', async () => {
  const notifId = new mongoose.Types.ObjectId();
  const notifDoc = new Notification({
    _id: notifId,
    recipientId: testUserId,
    type: 'PROPOSAL_RECEIVED',
    title: 'Proposal!',
    message: 'Check out proposal'
  });
  notifDoc.save = async () => notifDoc;

  const origFindById = Notification.findById;
  Notification.findById = () => ({
    exec: async () => notifDoc
  });

  try {
    const res = await request(authApp).patch(`/api/notifications/${notifId}/read`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.readAt);
  } finally {
    Notification.findById = origFindById;
  }
});

test('PATCH /api/notifications/read-all marks all unread notifications read', async () => {
  const origUpdateMany = Notification.updateMany;
  Notification.updateMany = () => ({
    exec: async () => ({ modifiedCount: 4 })
  });

  try {
    const res = await request(authApp).patch('/api/notifications/read-all');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.modifiedCount, 4);
  } finally {
    Notification.updateMany = origUpdateMany;
  }
});
