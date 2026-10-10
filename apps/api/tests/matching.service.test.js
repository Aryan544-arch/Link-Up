const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InterestRequest = require('../src/models/InterestRequest');
const matchingService = require('../src/services/matching.service');

test('calculateDistanceKm computes accurate spherical distance', () => {
  // Distance between Central Park (-73.968, 40.785) and Times Square (-73.985, 40.758) is ~3.3 km
  const dist = matchingService.calculateDistanceKm([-73.968, 40.785], [-73.985, 40.758]);
  assert.ok(dist > 3.0 && dist < 3.6, `Expected ~3.3 km, got ${dist}`);

  // Same coordinates must be 0 km
  const zeroDist = matchingService.calculateDistanceKm([-73.968, 40.785], [-73.968, 40.785]);
  assert.equal(zeroDist, 0);
});

test('evaluateMatch calculates deterministic scores and factual reasons', () => {
  const baseTime = Date.now() + 3600000;
  const source = {
    category: 'outdoor',
    skillLevel: 'all-levels',
    radiusKm: 5,
    timeStart: new Date(baseTime),
    timeEnd: new Date(baseTime + 14400000), // 4 hours
    location: { coordinates: [-73.968, 40.785] }
  };

  const target = {
    category: 'outdoor',
    skillLevel: 'intermediate',
    radiusKm: 5,
    timeStart: new Date(baseTime + 3600000), // 1 hour later
    timeEnd: new Date(baseTime + 14400000), // 3 hours overlap
    location: { coordinates: [-73.970, 40.786] } // ~0.2 km away
  };

  const eval1 = matchingService.evaluateMatch(source, target);
  const eval2 = matchingService.evaluateMatch(source, target);

  // Exact determinism
  assert.equal(eval1.score, eval2.score);
  assert.equal(eval1.overlapHours, 3);
  assert.ok(eval1.distanceKm < 0.5);
  assert.ok(eval1.score >= 80, `Expected high match score, got ${eval1.score}`);
  assert.equal(eval1.matchReasons.length, 4);
  assert.match(eval1.matchReasons[0], /Exact category match: outdoor/);
  assert.match(eval1.matchReasons[1], /Overlapping time window: 3.0 hours/);
});

test('findMatchesForRequest filters out ineligible candidates and returns deterministic ordering', async () => {
  const currentUserId = new mongoose.Types.ObjectId();
  const differentUser1 = new mongoose.Types.ObjectId();
  const differentUser2 = new mongoose.Types.ObjectId();
  const baseTime = Date.now() + 3600000;

  const sourceRequest = {
    _id: new mongoose.Types.ObjectId(),
    userId: currentUserId,
    category: 'outdoor',
    skillLevel: 'all-levels',
    radiusKm: 5,
    timeStart: new Date(baseTime),
    timeEnd: new Date(baseTime + 14400000), // 4 hours
    location: { type: 'Point', coordinates: [-73.968, 40.785] },
    displayArea: 'Central Park North',
    status: 'active'
  };

  // Mock database find for InterestRequest
  const originalFindById = InterestRequest.findById;
  const originalFind = InterestRequest.find;

  InterestRequest.findById = (id) => ({
    exec: async () => sourceRequest
  });

  const candidates = [
    // Candidate 1: Close distance, 3 hours overlap
    {
      _id: new mongoose.Types.ObjectId(),
      userId: { _id: differentUser1, displayName: 'Alice Runner' },
      category: 'outdoor',
      skillLevel: 'all-levels',
      radiusKm: 5,
      timeStart: new Date(baseTime + 3600000),
      timeEnd: new Date(baseTime + 14400000),
      location: { type: 'Point', coordinates: [-73.970, 40.786] }, // ~0.2 km
      displayArea: 'Central Park West',
      status: 'active',
      createdAt: new Date(baseTime - 1000)
    },
    // Candidate 2: Further distance (~2 km), 2 hours overlap
    {
      _id: new mongoose.Types.ObjectId(),
      userId: { _id: differentUser2, displayName: 'Bob Hiker' },
      category: 'outdoor',
      skillLevel: 'all-levels',
      radiusKm: 5,
      timeStart: new Date(baseTime + 7200000),
      timeEnd: new Date(baseTime + 14400000),
      location: { type: 'Point', coordinates: [-73.955, 40.770] }, // ~2 km
      displayArea: 'Upper East Side',
      status: 'active',
      createdAt: new Date(baseTime - 500)
    }
  ];

  InterestRequest.find = () => ({
    populate: () => ({
      exec: async () => candidates
    })
  });

  const matchResult = await matchingService.findMatchesForRequest({
    requestId: sourceRequest._id,
    currentUserId
  });

  assert.equal(matchResult.matches.length, 2);

  // Highest score must be first (Candidate 1 > Candidate 2)
  assert.ok(matchResult.matches[0].score >= matchResult.matches[1].score);
  assert.equal(matchResult.matches[0].targetRequest.userId.displayName, 'Alice Runner');

  // Privacy check: target coordinates must be redacted
  assert.equal(matchResult.matches[0].targetRequest.location.coordinates, null);
  assert.equal(matchResult.matches[0].targetRequest.location.isPrecise, false);
  assert.ok(matchResult.matches[0].targetRequest.approximateDistanceMeters > 0);

  InterestRequest.findById = originalFindById;
  InterestRequest.find = originalFind;
});

test('findMatchesForRequest rejects non-owners with 403 FORBIDDEN', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();

  const originalFindById = InterestRequest.findById;
  InterestRequest.findById = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      userId: ownerId,
      status: 'active'
    })
  });

  await assert.rejects(
    async () => {
      await matchingService.findMatchesForRequest({
        requestId: new mongoose.Types.ObjectId(),
        currentUserId: strangerId
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  InterestRequest.findById = originalFindById;
});
