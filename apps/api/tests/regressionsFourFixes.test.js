const { describe, it, before, after } = require('node:test');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const Notification = require('../src/models/Notification');
const User = require('../src/models/User');
const aiService = require('../src/services/ai.service');

before(async () => {
  await connectDB();
});

after(async () => {
  await closeSessionStore();
  await disconnectDB();
});

const organizerUser = {
  id: '6acab79523b6da3e5f167651',
  _id: '6acab79523b6da3e5f167651',
  email: 'organizer@meetpulse.local',
  displayName: 'Contest Organizer'
};

const participantUser = {
  id: '6acab79523b6da3e5f167652',
  _id: '6acab79523b6da3e5f167652',
  email: 'participant@meetpulse.local',
  displayName: 'Contest Participant'
};

const outsiderUser = {
  id: '6acab79523b6da3e5f167653',
  _id: '6acab79523b6da3e5f167653',
  email: 'outsider@meetpulse.local',
  displayName: 'Outsider User'
};

function createTestAppWithCustomAuth(currentUser) {
  const authMiddleware = (req, res, next) => {
    if (currentUser) {
      req.user = { ...currentUser };
    }
    next();
  };
  return createApp({ authMiddleware });
}

// -------------------------------------------------------------
// 1. Contest / Activity Participation Request Flow
// -------------------------------------------------------------
test('Regression 1: Contest participation request reaches organiser with notifications and permissions', async (t) => {
  const isDbConnected = mongoose.connection.readyState === 1;

  await t.test('POST /api/contests/:id/join works via route alias', async () => {
    const app = createTestAppWithCustomAuth(participantUser);
    const fakeId = new mongoose.Types.ObjectId().toString();

    // With a non-existent ID, it routes through the contest router and produces 404 ACTIVITY_NOT_FOUND
    const res = await request(app)
      .post(`/api/contests/${fakeId}/join`)
      .send({ note: 'Ready to compete!' });

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'ACTIVITY_NOT_FOUND');
  });

  await t.test('POST /api/contests/:id/join rejects malformed contest ID with 400', async () => {
    const app = createTestAppWithCustomAuth(participantUser);
    const res = await request(app)
      .post('/api/contests/invalid-id-xyz/join')
      .send({ note: 'Ready!' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'INVALID_ID');
  });

  if (isDbConnected) {
    let testContest;

    // Create participant user record so display name is verified in notifications
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(participantUser.id) },
      {
        $set: {
          email: participantUser.email,
          displayName: participantUser.displayName,
          passwordHash: 'dummyhash',
          isVerified: true
        }
      },
      { upsert: true }
    );

    // Create a published contest/activity for testing
    testContest = new Activity({
      title: 'Spring 10K Running Contest',
      description: 'Competitive and recreational running contest in Central Park.',
      category: 'fitness',
      organizerId: new mongoose.Types.ObjectId(organizerUser.id),
      startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 7200000),
      location: {
        type: 'Point',
        coordinates: [-73.9818, 40.7681],
        isPrecise: true
      },
      displayArea: 'Central Park South, New York',
      budget: 10,
      skillLevel: 'intermediate',
      capacity: 10,
      placesFilled: 1,
      approvalRequired: true,
      status: 'published'
    });
    await testContest.save();

    t.after(async () => {
      await Activity.deleteOne({ _id: testContest._id });
      await JoinRequest.deleteMany({ activityId: testContest._id });
      await Notification.deleteMany({ relatedResourceId: testContest._id });
      await User.deleteOne({ _id: new mongoose.Types.ObjectId(participantUser.id) });
    });

    await t.test('Participant submits request to contest and notification is stored for organiser', async () => {
      const app = createTestAppWithCustomAuth(participantUser);

      const res = await request(app)
        .post(`/api/contests/${testContest._id}/join`)
        .send({ note: 'Excited to participate in the contest!' })
        .expect(201);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'pending');
      assert.equal(res.body.data.activityId.toString(), testContest._id.toString());
      assert.equal(res.body.data.userId.toString(), participantUser.id);

      // Verify in-app notification exists for the organiser with real applicant name
      const notif = await Notification.findOne({
        recipientId: new mongoose.Types.ObjectId(organizerUser.id),
        relatedResourceId: testContest._id
      });

      assert.ok(notif, 'Organiser must receive an in-app notification for the participation request');
      assert.equal(notif.type, 'JOIN_REQUEST_RECEIVED');
      assert.ok(notif.message.includes('Spring 10K Running Contest'));
      assert.ok(notif.message.includes(participantUser.displayName));
      assert.equal(notif.metadata?.applicantName, participantUser.displayName);
    });

    await t.test('Duplicate participation request is rejected with 409 DUPLICATE_JOIN_REQUEST', async () => {
      const app = createTestAppWithCustomAuth(participantUser);

      const res = await request(app)
        .post(`/api/contests/${testContest._id}/join`)
        .send({ note: 'Duplicate attempt' })
        .expect(409);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DUPLICATE_JOIN_REQUEST');
    });

    await t.test('Organiser can view the pending participation request via GET /api/contests/:id/requests', async () => {
      const app = createTestAppWithCustomAuth(organizerUser);

      const res = await request(app)
        .get(`/api/contests/${testContest._id}/requests`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.requests));
      assert.equal(res.body.data.requests.length, 1);
      assert.equal(res.body.data.requests[0].status, 'pending');
      assert.equal(res.body.data.requests[0].note, 'Excited to participate in the contest!');
      assert.equal(res.body.data.requests[0].userId.displayName, participantUser.displayName);
    });

    await t.test('Non-organiser receives 403 FORBIDDEN when attempting to view contest requests', async () => {
      const app = createTestAppWithCustomAuth(outsiderUser);

      const res = await request(app)
        .get(`/api/contests/${testContest._id}/requests`)
        .expect(403);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    await t.test('Unauthenticated user receives 401 UNAUTHORIZED when viewing contest requests', async () => {
      const app = createApp(); // No auth middleware

      const res = await request(app)
        .get(`/api/contests/${testContest._id}/requests`)
        .expect(401);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    });
  }
});

// -------------------------------------------------------------
// 2. AI Planning Assistant Pipeline & Meaningful Variations
// -------------------------------------------------------------
test('Regression 2: AI planning assistant meaningfully reflects user inputs and provides truthful provenance', async (t) => {
  await t.test('Changing budget from 0 to 25 changes synthesized description and checklist', () => {
    const freePlan = aiService.getDeterministicPlan({
      category: 'fitness',
      prompt: 'Morning interval run',
      budget: 0,
      displayArea: 'Central Park South, New York'
    });

    const paidPlan = aiService.getDeterministicPlan({
      category: 'fitness',
      prompt: 'Morning interval run',
      budget: 25,
      displayArea: 'Central Park South, New York'
    });

    assert.notEqual(freePlan.suggestion.description, paidPlan.suggestion.description);
    assert.ok(freePlan.suggestion.description.includes('free community session'));
    assert.ok(paidPlan.suggestion.description.includes('$25'));
    assert.ok(paidPlan.suggestion.checklist.some((item) => item.includes('$25')));
  });

  await t.test('Changing skill level from beginner to advanced meaningfully changes description', () => {
    const beginnerPlan = aiService.getDeterministicPlan({
      category: 'outdoor',
      prompt: 'Trail hiking',
      skillLevel: 'beginner'
    });

    const advancedPlan = aiService.getDeterministicPlan({
      category: 'outdoor',
      prompt: 'Trail hiking',
      skillLevel: 'advanced'
    });

    assert.notEqual(beginnerPlan.suggestion.description, advancedPlan.suggestion.description);
    assert.ok(beginnerPlan.suggestion.description.toLowerCase().includes('beginner'));
    assert.ok(advancedPlan.suggestion.description.toLowerCase().includes('advanced'));
  });

  await t.test('Changing prompt and location produces varied, relevant descriptions', () => {
    const chessPlan = aiService.getDeterministicPlan({
      category: 'social',
      prompt: 'Outdoor speed chess tournament in the plaza',
      displayArea: 'Washington Square Park, Greenwich Village'
    });

    const bookPlan = aiService.getDeterministicPlan({
      category: 'social',
      prompt: 'Philosophy book discussion circle',
      displayArea: 'Bryant Park, Midtown Manhattan'
    });

    assert.notEqual(chessPlan.suggestion.title, bookPlan.suggestion.title);
    assert.notEqual(chessPlan.suggestion.description, bookPlan.suggestion.description);
    assert.ok(chessPlan.suggestion.description.includes('Outdoor speed chess'));
    assert.ok(chessPlan.suggestion.description.includes('Washington Square Park'));
    assert.ok(bookPlan.suggestion.description.includes('Philosophy book discussion'));
    assert.ok(bookPlan.suggestion.description.includes('Bryant Park'));
  });

  await t.test('Produces distinct domain-specific plans for photography walk, advanced cycling with budget, and board games', () => {
    const photoPlan = aiService.getDeterministicPlan({
      category: 'creative',
      prompt: 'Sunset smartphone photography walk',
      skillLevel: 'beginner',
      budget: 0,
      durationMinutes: 60,
      displayArea: 'Battery Park Esplanade'
    });

    const cyclingPlan = aiService.getDeterministicPlan({
      category: 'outdoor',
      prompt: 'Morning paceline road cycling',
      skillLevel: 'advanced',
      budget: 15,
      durationMinutes: 90,
      displayArea: 'Hudson River Greenway'
    });

    const boardgamePlan = aiService.getDeterministicPlan({
      category: 'social',
      prompt: 'Tabletop euro strategy game night',
      skillLevel: 'intermediate',
      budget: 5,
      durationMinutes: 120,
      displayArea: 'Community Center Lounge'
    });

    // Titles must be distinct
    assert.notEqual(photoPlan.suggestion.title, cyclingPlan.suggestion.title);
    assert.notEqual(photoPlan.suggestion.title, boardgamePlan.suggestion.title);

    // Descriptions must contain domain-specific phrasing and user inputs
    assert.ok(photoPlan.suggestion.description.includes('camera'));
    assert.ok(photoPlan.suggestion.description.includes('framing'));
    assert.ok(photoPlan.suggestion.description.includes('Battery Park Esplanade'));
    assert.ok(photoPlan.suggestion.description.includes('free community session'));

    assert.ok(cyclingPlan.suggestion.description.includes('cycling') || cyclingPlan.suggestion.description.includes('pedaling'));
    assert.ok(cyclingPlan.suggestion.description.includes('$15'));
    assert.ok(cyclingPlan.suggestion.description.includes('90 minutes'));

    assert.ok(boardgamePlan.suggestion.description.includes('board games') || boardgamePlan.suggestion.description.includes('games'));
    assert.ok(boardgamePlan.suggestion.description.includes('$5'));
    assert.ok(boardgamePlan.suggestion.description.includes('120 minutes'));

    // Checklists must contain domain-specific items
    assert.ok(photoPlan.suggestion.checklist.some((i) => i.toLowerCase().includes('water') || i.toLowerCase().includes('camera')));
    assert.ok(cyclingPlan.suggestion.checklist.some((i) => i.toLowerCase().includes('helmet') || i.toLowerCase().includes('bicycle')));
    assert.ok(boardgamePlan.suggestion.checklist.some((i) => i.toLowerCase().includes('game')));

    // Safety tips must reflect the specific activity
    assert.ok(cyclingPlan.suggestion.safetyTips.some((i) => i.toLowerCase().includes('helmet') || i.toLowerCase().includes('traffic')));
  });

  await t.test('Fallback response clearly identifies source: fallback and provider metadata', () => {
    const plan = aiService.getDeterministicPlan({
      category: 'nature',
      prompt: 'Birdwatching walk'
    });

    assert.equal(plan.source, 'fallback');
    assert.equal(plan.provider, 'deterministic-fallback');
    assert.ok(plan.disclaimer, 'Must include clear disclaimer explaining provenance');
    assert.ok(plan.disclaimer.includes('deterministic'));
  });

  await t.test('generateActivityPlan gracefully handles errors and attaches errorDetails', async () => {
    const originalEnvKey = process.env.AI_PROVIDER_API_KEY;
    try {
      // Set an invalid key to trigger a real API failure
      process.env.AI_PROVIDER_API_KEY = 'invalid-test-key-trigger-failure';
      const plan = await aiService.generateActivityPlan({
        category: 'fitness',
        prompt: 'Sprint drills'
      });

      assert.equal(plan.source, 'fallback');
      assert.ok(plan.errorDetails, 'Must provide errorDetails when live provider fails');
      assert.ok(plan.errorDetails.includes('AI provider error'));
    } finally {
      process.env.AI_PROVIDER_API_KEY = originalEnvKey;
    }
  });
});

// -------------------------------------------------------------
// 3. Radius Filtering & Search Coordinates Validation
// -------------------------------------------------------------
test('Regression 4: Radius filtering requires coordinates and validates inputs correctly', async (t) => {
  const app = createApp();

  await t.test('Radius 3 km without coordinates succeeds (default radius baseline)', async () => {
    const res = await request(app)
      .get('/api/activities?radiusKm=3')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.search.locationApplied, false);
  });

  const testRadii = [1, 5, 10, 25];

  for (const r of testRadii) {
    await t.test(`Radius ${r} km without coordinates is rejected with 400 COORDINATES_REQUIRED`, async () => {
      const res = await request(app)
        .get(`/api/activities?radiusKm=${r}`)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'COORDINATES_REQUIRED');
      assert.equal(res.body.error.message, 'Coordinates (lat, lng) are required when specifying a search radius.');
    });

    await t.test(`Radius ${r} km WITH valid coordinates (40.7681, -73.9818) returns 200 with locationApplied: true`, async () => {
      const res = await request(app)
        .get(`/api/activities?lat=40.7681&lng=-73.9818&radiusKm=${r}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.search.locationApplied, true);
      assert.equal(res.body.data.search.radiusKm, r);
      assert.deepEqual(res.body.data.search.center, [-73.9818, 40.7681]);
    });
  }

  await t.test('Providing lat without lng is rejected with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/activities?lat=40.7681')
      .expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      JSON.stringify(res.body.error).includes('lng') ||
      JSON.stringify(res.body.error).includes('lat')
    );
  });

  await t.test('Providing invalid out-of-range coordinates is rejected with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/activities?lat=95&lng=-73.9818&radiusKm=5')
      .expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('Providing negative or excessive radius is rejected with 400 VALIDATION_ERROR', async () => {
    const negRes = await request(app)
      .get('/api/activities?lat=40.7681&lng=-73.9818&radiusKm=-5')
      .expect(400);

    assert.equal(negRes.body.success, false);
    assert.equal(negRes.body.error.code, 'VALIDATION_ERROR');

    const excessiveRes = await request(app)
      .get('/api/activities?lat=40.7681&lng=-73.9818&radiusKm=500')
      .expect(400);

    assert.equal(excessiveRes.body.success, false);
    assert.equal(excessiveRes.body.error.code, 'VALIDATION_ERROR');
  });
});
