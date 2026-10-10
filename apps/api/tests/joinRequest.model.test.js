const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const JoinRequest = require('../src/models/JoinRequest');
const { JOIN_REQUEST_STATUSES } = require('../src/constants/joinRequest.constants');

function getValidJoinRequestData(overrides = {}) {
  return {
    activityId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    status: 'pending',
    note: 'Looking forward to this!',
    ...overrides
  };
}

test('JoinRequest model imports cleanly without a live MongoDB connection', () => {
  assert.ok(JoinRequest);
  assert.equal(JoinRequest.modelName, 'JoinRequest');
  assert.equal(mongoose.connection.readyState, 0);
});

test('Valid JoinRequest document passes schema validation', () => {
  const req = new JoinRequest(getValidJoinRequestData());
  const err = req.validateSync();
  assert.equal(err, undefined);
  assert.equal(req.status, 'pending');
});

test('JoinRequest model fails validation when required fields are missing', () => {
  const req = new JoinRequest({});
  const err = req.validateSync();
  assert.ok(err);
  assert.ok(err.errors.activityId);
  assert.ok(err.errors.userId);
});

test('JoinRequest status requires one of the allowed enums and defaults to pending', () => {
  const defaultReq = new JoinRequest(getValidJoinRequestData({ status: undefined }));
  assert.equal(defaultReq.status, 'pending');

  for (const st of JOIN_REQUEST_STATUSES) {
    const req = new JoinRequest(getValidJoinRequestData({ status: st }));
    assert.equal(req.validateSync(), undefined);
  }

  const invalidReq = new JoinRequest(getValidJoinRequestData({ status: 'confirmed' }));
  const err = invalidReq.validateSync();
  assert.ok(err.errors.status);
});

test('JoinRequest note enforces max length boundary', () => {
  const longNote = 'a'.repeat(501);
  const req = new JoinRequest(getValidJoinRequestData({ note: longNote }));
  const err = req.validateSync();
  assert.ok(err.errors.note);
});

test('JoinRequest schema defines partial unique index for active duplicate prevention', () => {
  const indexes = JoinRequest.schema.indexes();

  // Find index on activityId and userId
  const uniqueIndex = indexes.find(([fields, options]) => {
    return fields.activityId === 1 && fields.userId === 1 && options?.unique === true;
  });

  assert.ok(uniqueIndex, 'Compound unique index on (activityId, userId) must exist');
  const [fields, options] = uniqueIndex;
  assert.equal(options.unique, true);
  assert.ok(options.partialFilterExpression);
  assert.deepEqual(options.partialFilterExpression.status, {
    $in: ['pending', 'approved']
  });
});
