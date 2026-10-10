const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createActivitySchema,
  updateActivitySchema,
  activitySearchQuerySchema
} = require('../src/validators/activity.validator');

function getValidCreatePayload(overrides = {}) {
  const startsAt = new Date(Date.now() + 3600000).toISOString();
  const endsAt = new Date(Date.now() + 7200000).toISOString();

  return {
    title: 'Sunset Bouldering Session',
    description: 'Bouldering together outdoors at the park rocks. All skill levels welcome.',
    category: 'outdoor',
    startsAt,
    endsAt,
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785] // [lng, lat]
    },
    displayArea: 'Central Park Boulders',
    budget: 0,
    skillLevel: 'all-levels',
    capacity: 8,
    approvalRequired: true,
    ...overrides
  };
}

// Tests for createActivitySchema
test('createActivitySchema parses and validates a valid payload with defaults', () => {
  const payload = getValidCreatePayload({ budget: undefined, skillLevel: undefined });
  const result = createActivitySchema.safeParse(payload);

  assert.equal(result.success, true);
  assert.equal(result.data.budget, 0);
  assert.equal(result.data.skillLevel, 'all-levels');
  assert.equal(result.data.approvalRequired, true);
  assert.ok(result.data.startsAt instanceof Date);
  assert.ok(result.data.endsAt instanceof Date);
});

test('createActivitySchema rejects attempts to inject protected fields', () => {
  const protectedFieldAttempts = [
    { organizerId: '65f123456789abcdef123456' },
    { placesFilled: 3 },
    { status: 'published' },
    { _id: '65f123456789abcdef123456' }
  ];

  for (const extra of protectedFieldAttempts) {
    const payload = getValidCreatePayload(extra);
    const result = createActivitySchema.safeParse(payload);
    assert.equal(result.success, false, `Should reject payload containing ${Object.keys(extra)[0]}`);
  }
});

test('createActivitySchema rejects endsAt before or equal to startsAt', () => {
  const now = new Date();
  const earlier = new Date(now.getTime() - 1000).toISOString();

  const payload = getValidCreatePayload({
    startsAt: now.toISOString(),
    endsAt: earlier
  });
  const result = createActivitySchema.safeParse(payload);
  assert.equal(result.success, false);
  const endsAtErr = result.error.errors.find((e) => e.path.includes('endsAt'));
  assert.ok(endsAtErr);
});

test('createActivitySchema validates coordinates boundaries and ordering', () => {
  // Longitude out of range
  const invalidLng = getValidCreatePayload({
    location: { type: 'Point', coordinates: [185, 40] }
  });
  assert.equal(createActivitySchema.safeParse(invalidLng).success, false);

  // Latitude out of range
  const invalidLat = getValidCreatePayload({
    location: { type: 'Point', coordinates: [-73, 95] }
  });
  assert.equal(createActivitySchema.safeParse(invalidLat).success, false);
});

test('createActivitySchema rejects invalid numeric boundaries', () => {
  // Negative budget
  const negBudget = getValidCreatePayload({ budget: -5 });
  assert.equal(createActivitySchema.safeParse(negBudget).success, false);

  // Capacity 0
  const zeroCap = getValidCreatePayload({ capacity: 0 });
  assert.equal(createActivitySchema.safeParse(zeroCap).success, false);

  // Capacity non-integer
  const floatCap = getValidCreatePayload({ capacity: 4.2 });
  assert.equal(createActivitySchema.safeParse(floatCap).success, false);
});

// Tests for updateActivitySchema
test('updateActivitySchema allows partial updates of permitted fields', () => {
  const result = updateActivitySchema.safeParse({
    title: 'Updated Sunset Bouldering Session',
    capacity: 12
  });
  assert.equal(result.success, true);
  assert.equal(result.data.title, 'Updated Sunset Bouldering Session');
  assert.equal(result.data.capacity, 12);
});

test('updateActivitySchema rejects empty update payloads', () => {
  const result = updateActivitySchema.safeParse({});
  assert.equal(result.success, false);
});

test('updateActivitySchema strictly forbids protected fields', () => {
  const attempts = [
    { organizerId: '65f123456789abcdef123456' },
    { status: 'cancelled' },
    { placesFilled: 5 }
  ];

  for (const attempt of attempts) {
    const result = updateActivitySchema.safeParse(attempt);
    assert.equal(result.success, false, `Should reject ${Object.keys(attempt)[0]} in update`);
  }
});

test('updateActivitySchema validates date order when both dates are provided', () => {
  const now = new Date();
  const earlier = new Date(now.getTime() - 5000);

  const result = updateActivitySchema.safeParse({
    startsAt: now.toISOString(),
    endsAt: earlier.toISOString()
  });
  assert.equal(result.success, false);
});

// Tests for activitySearchQuerySchema
test('activitySearchQuerySchema applies defaults on empty query', () => {
  const result = activitySearchQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.radiusKm, 3);
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 20);
});

test('activitySearchQuerySchema coerces and validates valid search parameters', () => {
  const query = {
    lat: '40.785',
    lng: '-73.968',
    radiusKm: '5.5',
    category: 'sports',
    skillLevel: 'beginner',
    maxBudget: '25',
    page: '2',
    limit: '15'
  };

  const result = activitySearchQuerySchema.safeParse(query);
  assert.equal(result.success, true);
  assert.equal(result.data.lat, 40.785);
  assert.equal(result.data.lng, -73.968);
  assert.equal(result.data.radiusKm, 5.5);
  assert.equal(result.data.category, 'sports');
  assert.equal(result.data.skillLevel, 'beginner');
  assert.equal(result.data.maxBudget, 25);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 15);
});

test('activitySearchQuerySchema requires lat and lng together', () => {
  // Only lat provided
  const onlyLat = activitySearchQuerySchema.safeParse({ lat: 40.785 });
  assert.equal(onlyLat.success, false);

  // Only lng provided
  const onlyLng = activitySearchQuerySchema.safeParse({ lng: -73.968 });
  assert.equal(onlyLng.success, false);
});

test('activitySearchQuerySchema rejects invalid coordinates and pagination boundaries', () => {
  // Latitude > 90
  assert.equal(activitySearchQuerySchema.safeParse({ lat: 91, lng: 0 }).success, false);

  // Longitude < -180
  assert.equal(activitySearchQuerySchema.safeParse({ lat: 0, lng: -185 }).success, false);

  // Radius <= 0
  assert.equal(activitySearchQuerySchema.safeParse({ radiusKm: 0 }).success, false);

  // Page < 1
  assert.equal(activitySearchQuerySchema.safeParse({ page: 0 }).success, false);

  // Limit > 100
  assert.equal(activitySearchQuerySchema.safeParse({ limit: 150 }).success, false);
});

test('activitySearchQuerySchema validates date filter order', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 10000);

  const invalid = activitySearchQuerySchema.safeParse({
    startDate: now.toISOString(),
    endDate: past.toISOString()
  });
  assert.equal(invalid.success, false);

  const valid = activitySearchQuerySchema.safeParse({
    startDate: past.toISOString(),
    endDate: now.toISOString()
  });
  assert.equal(valid.success, true);
});
