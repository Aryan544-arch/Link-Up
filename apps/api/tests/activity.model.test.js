const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Activity = require('../src/models/Activity');
const {
  ACTIVITY_CATEGORIES,
  SKILL_LEVELS,
  ACTIVITY_STATUSES
} = require('../src/constants/activity.constants');

function getValidActivityData(overrides = {}) {
  const startsAt = new Date(Date.now() + 3600000); // 1 hour in future
  const endsAt = new Date(Date.now() + 7200000);   // 2 hours in future

  return {
    title: 'Weekend Trail Hike',
    description: 'A friendly group hike exploring local nature trails.',
    category: 'nature',
    organizerId: new mongoose.Types.ObjectId(),
    startsAt,
    endsAt,
    location: {
      type: 'Point',
      coordinates: [-73.968285, 40.785091] // [lng, lat]
    },
    displayArea: 'Central Park North, NY',
    budget: 0,
    skillLevel: 'all-levels',
    capacity: 10,
    placesFilled: 0,
    approvalRequired: true,
    status: 'draft',
    ...overrides
  };
}

test('Activity model imports cleanly without a live MongoDB connection', () => {
  assert.ok(Activity);
  assert.equal(Activity.modelName, 'Activity');
  assert.equal(mongoose.connection.readyState, 0);
});

test('Valid Activity document passes schema validation', () => {
  const activity = new Activity(getValidActivityData());
  const err = activity.validateSync();
  assert.equal(err, undefined);
  assert.equal(activity.placesRemaining, 10);
  assert.equal(activity.isFull, false);
});

test('Activity model fails validation when required fields are missing', () => {
  const activity = new Activity({});
  const err = activity.validateSync();
  assert.ok(err);
  assert.ok(err.errors.title);
  assert.ok(err.errors.description);
  assert.ok(err.errors.category);
  assert.ok(err.errors.organizerId);
  assert.ok(err.errors.startsAt);
  assert.ok(err.errors.endsAt);
  assert.ok(err.errors.location);
  assert.ok(err.errors.displayArea);
  assert.ok(err.errors.capacity);
});

test('Activity title and description enforce length boundaries', () => {
  // Title too short
  const shortTitle = new Activity(getValidActivityData({ title: 'Hi' }));
  const err1 = shortTitle.validateSync();
  assert.ok(err1.errors.title);

  // Description too short
  const shortDesc = new Activity(getValidActivityData({ description: 'Short' }));
  const err2 = shortDesc.validateSync();
  assert.ok(err2.errors.description);
});

test('Activity category requires one of the allowed enums', () => {
  // Valid categories pass
  for (const cat of ACTIVITY_CATEGORIES) {
    const act = new Activity(getValidActivityData({ category: cat }));
    assert.equal(act.validateSync(), undefined);
  }

  // Invalid category fails
  const invalidCat = new Activity(getValidActivityData({ category: 'invalid-category' }));
  const err = invalidCat.validateSync();
  assert.ok(err.errors.category);
});

test('Activity status requires one of the allowed enums and defaults to draft', () => {
  const defaultStatus = new Activity(getValidActivityData({ status: undefined }));
  assert.equal(defaultStatus.status, 'draft');

  for (const st of ACTIVITY_STATUSES) {
    const act = new Activity(getValidActivityData({ status: st }));
    assert.equal(act.validateSync(), undefined);
  }

  const invalidStatus = new Activity(getValidActivityData({ status: 'archived' }));
  const err = invalidStatus.validateSync();
  assert.ok(err.errors.status);
});

test('Activity skillLevel requires allowed enums and defaults to all-levels', () => {
  const defaultSkill = new Activity(getValidActivityData({ skillLevel: undefined }));
  assert.equal(defaultSkill.skillLevel, 'all-levels');

  for (const skill of SKILL_LEVELS) {
    const act = new Activity(getValidActivityData({ skillLevel: skill }));
    assert.equal(act.validateSync(), undefined);
  }

  const invalidSkill = new Activity(getValidActivityData({ skillLevel: 'expert' }));
  const err = invalidSkill.validateSync();
  assert.ok(err.errors.skillLevel);
});

test('GeoJSON coordinates must be [longitude, latitude] within valid numeric ranges', () => {
  // Valid coordinates: lng: -73.96, lat: 40.78
  const valid = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [-73.96, 40.78] }
  }));
  assert.equal(valid.validateSync(), undefined);

  // Invalid: longitude < -180
  const invalidLngLow = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [-181, 40.78] }
  }));
  assert.ok(invalidLngLow.validateSync().errors['location.coordinates']);

  // Invalid: longitude > 180
  const invalidLngHigh = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [181, 40.78] }
  }));
  assert.ok(invalidLngHigh.validateSync().errors['location.coordinates']);

  // Invalid: latitude < -90
  const invalidLatLow = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [-73.96, -91] }
  }));
  assert.ok(invalidLatLow.validateSync().errors['location.coordinates']);

  // Invalid: latitude > 90
  const invalidLatHigh = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [-73.96, 91] }
  }));
  assert.ok(invalidLatHigh.validateSync().errors['location.coordinates']);

  // Invalid: wrong number of coordinates
  const notPair = new Activity(getValidActivityData({
    location: { type: 'Point', coordinates: [-73.96] }
  }));
  assert.ok(notPair.validateSync().errors['location.coordinates']);
});

test('Activity endsAt must be strictly greater than startsAt', () => {
  const now = new Date();
  const earlier = new Date(now.getTime() - 3600000);

  const invalidDates = new Activity(getValidActivityData({
    startsAt: now,
    endsAt: earlier
  }));
  const err = invalidDates.validateSync();
  assert.ok(err.errors.endsAt);

  const equalDates = new Activity(getValidActivityData({
    startsAt: now,
    endsAt: now
  }));
  const errEqual = equalDates.validateSync();
  assert.ok(errEqual.errors.endsAt);
});

test('Activity capacity and placesFilled enforce numeric and bounds constraints', () => {
  // Capacity < 1 fails
  const zeroCap = new Activity(getValidActivityData({ capacity: 0 }));
  assert.ok(zeroCap.validateSync().errors.capacity);

  // Capacity negative fails
  const negCap = new Activity(getValidActivityData({ capacity: -5 }));
  assert.ok(negCap.validateSync().errors.capacity);

  // Capacity non-integer fails
  const floatCap = new Activity(getValidActivityData({ capacity: 4.5 }));
  assert.ok(floatCap.validateSync().errors.capacity);

  // Budget negative fails
  const negBudget = new Activity(getValidActivityData({ budget: -10 }));
  assert.ok(negBudget.validateSync().errors.budget);

  // placesFilled > capacity fails
  const overbooked = new Activity(getValidActivityData({ capacity: 5, placesFilled: 6 }));
  assert.ok(overbooked.validateSync().errors.placesFilled);

  // placesFilled == capacity calculates isFull and placesRemaining
  const full = new Activity(getValidActivityData({ capacity: 5, placesFilled: 5 }));
  assert.equal(full.validateSync(), undefined);
  assert.equal(full.isFull, true);
  assert.equal(full.placesRemaining, 0);
});

test('Activity schema defines 2dsphere and discovery indexes', () => {
  const indexes = Activity.schema.indexes();
  const indexFields = indexes.map(([fields]) => fields);

  // Verify 2dsphere index on location
  const has2dSphere = indexFields.some((f) => f.location === '2dsphere');
  assert.equal(has2dSphere, true, 'Should define 2dsphere index on location');

  // Verify compound index on status and startsAt
  const hasStatusStartsAt = indexFields.some((f) => f.status === 1 && f.startsAt === 1);
  assert.equal(hasStatusStartsAt, true, 'Should define compound index on status and startsAt');

  // Verify compound index on organizerId and status
  const hasOrganizerStatus = indexFields.some((f) => f.organizerId === 1 && f.status === 1);
  assert.equal(hasOrganizerStatus, true, 'Should define compound index on organizerId and status');
});
