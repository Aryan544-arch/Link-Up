const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InterestRequest = require('../src/models/InterestRequest');

test('InterestRequest model imports cleanly without a live MongoDB connection', () => {
  assert.ok(InterestRequest);
  assert.equal(InterestRequest.modelName, 'InterestRequest');
});

test('Valid InterestRequest document passes schema validation', () => {
  const doc = new InterestRequest({
    userId: new mongoose.Types.ObjectId(),
    category: 'outdoor',
    title: 'Morning Trail Hike',
    timeStart: new Date(Date.now() + 3600000),
    timeEnd: new Date(Date.now() + 7200000),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park / North Woods',
    radiusKm: 5,
    maxBudget: 10,
    skillLevel: 'all-levels',
    groupSize: 4
  });

  const err = doc.validateSync();
  assert.equal(err, undefined);
  assert.equal(doc.status, 'active');
  assert.equal(doc.radiusKm, 5);
  assert.equal(doc.groupSize, 4);
});

test('InterestRequest model fails validation when required fields are missing', () => {
  const doc = new InterestRequest({});
  const err = doc.validateSync();
  assert.ok(err);
  assert.ok(err.errors.userId);
  assert.ok(err.errors.category);
  assert.ok(err.errors.timeStart);
  assert.ok(err.errors.timeEnd);
  assert.ok(err.errors.location);
  assert.ok(err.errors.displayArea);
});

test('InterestRequest status requires one of the allowed enums', () => {
  const doc = new InterestRequest({
    userId: new mongoose.Types.ObjectId(),
    category: 'outdoor',
    timeStart: new Date(Date.now() + 3600000),
    timeEnd: new Date(Date.now() + 7200000),
    location: { type: 'Point', coordinates: [-73.968, 40.785] },
    displayArea: 'Central Park',
    status: 'invalid-status'
  });

  const err = doc.validateSync();
  assert.ok(err);
  assert.ok(err.errors.status);
});

test('InterestRequest timeEnd must be strictly after timeStart', () => {
  const now = Date.now();
  const doc = new InterestRequest({
    userId: new mongoose.Types.ObjectId(),
    category: 'outdoor',
    timeStart: new Date(now + 7200000),
    timeEnd: new Date(now + 3600000), // Earlier than start
    location: { type: 'Point', coordinates: [-73.968, 40.785] },
    displayArea: 'Central Park'
  });

  const err = doc.validateSync();
  assert.ok(err);
  assert.ok(err.errors.timeEnd);
  assert.match(err.errors.timeEnd.message, /End time must be after start time/);
});

test('InterestRequest defines partial unique index for single active request per category', () => {
  const indexes = InterestRequest.schema.indexes();
  const uniqueCategoryIndex = indexes.find(
    ([fields, options]) =>
      fields.userId === 1 &&
      fields.category === 1 &&
      options &&
      options.unique === true &&
      options.partialFilterExpression &&
      options.partialFilterExpression.status === 'active'
  );

  assert.ok(
    uniqueCategoryIndex,
    'Expected partial unique index on { userId: 1, category: 1 } for active requests'
  );
});
