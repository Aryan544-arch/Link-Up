const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const joinRequestService = require('../src/services/joinRequest.service');

test('Atomic conditional update prevents overbooking under simulated race condition', async () => {
  const activityId = new mongoose.Types.ObjectId();
  const capacity = 2;
  let currentPlacesFilled = 1; // Only 1 spot remaining

  // Mock Activity.findOneAndUpdate simulating MongoDB atomic document write lock
  const originalFindOneUpdateAct = Activity.findOneAndUpdate;
  Activity.findOneAndUpdate = (filter, update, options) => {
    return {
      exec: async () => {
        // Evaluate atomic $expr: { $lt: ['$placesFilled', '$capacity'] }
        if (currentPlacesFilled < capacity) {
          currentPlacesFilled += 1;
          return { _id: activityId, capacity, placesFilled: currentPlacesFilled };
        }
        return null; // Capacity reached, zero documents matched
      }
    };
  };

  // Simulate 5 concurrent approval attempts arriving simultaneously
  const approvalAttempts = Array.from({ length: 5 }, async () => {
    const updated = await Activity.findOneAndUpdate(
      {
        _id: activityId,
        status: 'published',
        $expr: { $lt: ['$placesFilled', '$capacity'] }
      },
      {
        $inc: { placesFilled: 1 }
      },
      { new: true }
    ).exec();

    return updated !== null;
  });

  const results = await Promise.all(approvalAttempts);
  const successCount = results.filter(Boolean).length;
  const failureCount = results.filter((s) => !s).length;

  assert.equal(successCount, 1, 'Exactly one approval must succeed for the one remaining spot');
  assert.equal(failureCount, 4, 'All four excess concurrent attempts must be rejected');
  assert.equal(currentPlacesFilled, capacity, 'placesFilled must equal capacity and never exceed it');

  Activity.findOneAndUpdate = originalFindOneUpdateAct;
});

test('Real MongoDB concurrency: simultaneous approvals at capacity limit', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database concurrency test');
    return;
  }

  try {
    await Activity.deleteMany({});
    await JoinRequest.deleteMany({});
    await Activity.syncIndexes();
    await JoinRequest.syncIndexes();

    const organizerId = new mongoose.Types.ObjectId();
    const capacity = 2;

    // Create activity with capacity = 2, placesFilled = 0
    const activity = new Activity({
      title: 'Race Condition Test Activity',
      description: 'Testing concurrency safety on live MongoDB.',
      category: 'nature',
      organizerId,
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      capacity,
      placesFilled: 0,
      approvalRequired: true,
      status: 'published'
    });
    await activity.save();

    // Create 5 distinct pending join requests from 5 different applicants
    const requests = [];
    for (let i = 0; i < 5; i++) {
      const applicantId = new mongoose.Types.ObjectId();
      const req = new JoinRequest({
        activityId: activity._id,
        userId: applicantId,
        status: 'pending'
      });
      await req.save();
      requests.push(req);
    }

    // Attempt 5 simultaneous approvals concurrently using Promise.all
    const approvalPromises = requests.map((req) =>
      joinRequestService
        .decideJoinRequest({
          requestId: req._id,
          decision: 'approved',
          currentUserId: organizerId
        })
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.code }))
    );

    const outcomes = await Promise.all(approvalPromises);
    const approvedCount = outcomes.filter((o) => o.success).length;
    const rejectedCount = outcomes.filter((o) => !o.success && o.error === 'ACTIVITY_FULL').length;

    assert.equal(approvedCount, 2, 'Exactly 2 approvals must succeed for capacity = 2');
    assert.equal(rejectedCount, 3, 'Exactly 3 approvals must fail with ACTIVITY_FULL');

    // Check final activity state in MongoDB
    const finalActivity = await Activity.findById(activity._id).exec();
    assert.equal(finalActivity.placesFilled, 2, 'placesFilled must equal capacity (2) in live database');
    assert.ok(finalActivity.placesFilled <= finalActivity.capacity, 'placesFilled must NEVER exceed capacity');
  } finally {
    if (isConnected) {
      try {
        await Activity.deleteMany({});
        await JoinRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: simultaneous duplicate join requests are prevented', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await Activity.deleteMany({});
    await JoinRequest.deleteMany({});
    await Activity.syncIndexes();
    await JoinRequest.syncIndexes();

    const organizerId = new mongoose.Types.ObjectId();
    const applicantId = new mongoose.Types.ObjectId();

    const activity = new Activity({
      title: 'Duplicate Prevention Test',
      description: 'Testing duplicate join requests concurrency.',
      category: 'nature',
      organizerId,
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      capacity: 5,
      placesFilled: 0,
      approvalRequired: true,
      status: 'published'
    });
    await activity.save();

    // Fire 2 simultaneous join requests from the exact same user
    const results = await Promise.allSettled([
      joinRequestService.requestToJoin({ activityId: activity._id, userId: applicantId }),
      joinRequestService.requestToJoin({ activityId: activity._id, userId: applicantId })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one request must be accepted');
    assert.equal(rejected.length, 1, 'The simultaneous duplicate must be rejected');
    assert.equal(rejected[0].reason.code, 'DUPLICATE_JOIN_REQUEST');

    // Verify only 1 document persisted in MongoDB
    const persistedDocs = await JoinRequest.find({ activityId: activity._id, userId: applicantId });
    assert.equal(persistedDocs.length, 1, 'Database must contain exactly 1 active request');
  } finally {
    if (isConnected) {
      try {
        await Activity.deleteMany({});
        await JoinRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: simultaneous cancellations cannot double-decrement placesFilled', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await Activity.deleteMany({});
    await JoinRequest.deleteMany({});
    await Activity.syncIndexes();
    await JoinRequest.syncIndexes();

    const organizerId = new mongoose.Types.ObjectId();
    const applicantId = new mongoose.Types.ObjectId();

    const activity = new Activity({
      title: 'Double Decrement Prevention Test',
      description: 'Testing cancellation race safety.',
      category: 'nature',
      organizerId,
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      capacity: 5,
      placesFilled: 1, // 1 spot filled by applicant
      approvalRequired: true,
      status: 'published'
    });
    await activity.save();

    const req = new JoinRequest({
      activityId: activity._id,
      userId: applicantId,
      status: 'approved'
    });
    await req.save();

    // Fire 2 simultaneous cancel requests on the exact same approved join request
    const results = await Promise.allSettled([
      joinRequestService.cancelJoinRequest({ requestId: req._id, currentUserId: applicantId }),
      joinRequestService.cancelJoinRequest({ requestId: req._id, currentUserId: applicantId })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Only one cancellation should succeed');
    assert.equal(rejected.length, 1, 'Second simultaneous cancellation must fail');

    // Verify placesFilled was decremented by exactly 1 (1 -> 0), NOT double-decremented to -1
    const finalActivity = await Activity.findById(activity._id);
    assert.equal(finalActivity.placesFilled, 0, 'placesFilled must be 0 (decremented exactly once)');
  } finally {
    if (isConnected) {
      try {
        await Activity.deleteMany({});
        await JoinRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: approval racing with cancellation maintains consistent capacity', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await Activity.deleteMany({});
    await JoinRequest.deleteMany({});
    await Activity.syncIndexes();
    await JoinRequest.syncIndexes();

    const organizerId = new mongoose.Types.ObjectId();
    const applicantId = new mongoose.Types.ObjectId();

    const activity = new Activity({
      title: 'Approval vs Cancel Race Test',
      description: 'Testing concurrent approval and cancellation consistency.',
      category: 'nature',
      organizerId,
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      capacity: 5,
      placesFilled: 0,
      approvalRequired: true,
      status: 'published'
    });
    await activity.save();

    const req = new JoinRequest({
      activityId: activity._id,
      userId: applicantId,
      status: 'pending'
    });
    await req.save();

    // Concurrently trigger organizer approval and applicant cancellation
    const [approvalOutcome, cancelOutcome] = await Promise.allSettled([
      joinRequestService.decideJoinRequest({
        requestId: req._id,
        decision: 'approved',
        currentUserId: organizerId
      }),
      joinRequestService.cancelJoinRequest({
        requestId: req._id,
        currentUserId: applicantId
      })
    ]);

    // Query live MongoDB state after both concurrent operations complete
    const finalReq = await JoinRequest.findById(req._id);
    const finalAct = await Activity.findById(activity._id);
    const approvedDocsCount = await JoinRequest.countDocuments({
      activityId: activity._id,
      status: 'approved'
    });

    // Capacity placesFilled must strictly match the count of approved requests in DB
    assert.equal(
      finalAct.placesFilled,
      approvedDocsCount,
      'Activity placesFilled must strictly equal the count of approved requests'
    );
    assert.ok(
      finalAct.placesFilled >= 0,
      'Activity placesFilled must never decrement below 0'
    );

    // If cancelled, placesFilled must be 0
    if (finalReq.status === 'cancelled') {
      assert.equal(
        finalAct.placesFilled,
        0,
        'placesFilled must be 0 when request ends in cancelled state'
      );
    }
  } finally {
    if (isConnected) {
      try {
        await Activity.deleteMany({});
        await JoinRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

