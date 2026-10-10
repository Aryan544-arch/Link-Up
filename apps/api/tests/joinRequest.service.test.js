const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const joinRequestService = require('../src/services/joinRequest.service');
const JoinRequest = require('../src/models/JoinRequest');
const Activity = require('../src/models/Activity');

test('requestToJoin rejects organizer joining their own activity', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();

  const originalFindById = Activity.findById;
  Activity.findById = () => ({
    exec: async () => ({
      _id: activityId,
      organizerId,
      status: 'published',
      startsAt: new Date(Date.now() + 3600000),
      placesFilled: 0,
      capacity: 10
    })
  });

  await assert.rejects(
    async () => {
      await joinRequestService.requestToJoin({
        activityId,
        userId: organizerId
      });
    },
    (err) => {
      assert.equal(err.code, 'ORGANIZER_CANNOT_JOIN');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  Activity.findById = originalFindById;
});

test('requestToJoin rejects joining unpublished or full activities', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const applicantId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();

  const originalFindById = Activity.findById;
  const originalFindOne = JoinRequest.findOne;

  JoinRequest.findOne = () => ({
    exec: async () => null
  });

  // 1. Unpublished activity
  Activity.findById = () => ({
    exec: async () => ({
      _id: activityId,
      organizerId,
      status: 'draft',
      startsAt: new Date(Date.now() + 3600000),
      placesFilled: 0,
      capacity: 10
    })
  });

  await assert.rejects(
    async () => {
      await joinRequestService.requestToJoin({ activityId, userId: applicantId });
    },
    (err) => {
      assert.equal(err.code, 'ACTIVITY_NOT_PUBLISHED');
      return true;
    }
  );

  // 2. Full activity
  Activity.findById = () => ({
    exec: async () => ({
      _id: activityId,
      organizerId,
      status: 'published',
      startsAt: new Date(Date.now() + 3600000),
      placesFilled: 10,
      capacity: 10
    })
  });

  await assert.rejects(
    async () => {
      await joinRequestService.requestToJoin({ activityId, userId: applicantId });
    },
    (err) => {
      assert.equal(err.code, 'ACTIVITY_FULL');
      return true;
    }
  );

  Activity.findById = originalFindById;
  JoinRequest.findOne = originalFindOne;
});

test('requestToJoin rejects duplicate active join requests', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const applicantId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();

  const originalFindById = Activity.findById;
  const originalFindOne = JoinRequest.findOne;

  Activity.findById = () => ({
    exec: async () => ({
      _id: activityId,
      organizerId,
      status: 'published',
      startsAt: new Date(Date.now() + 3600000),
      placesFilled: 0,
      capacity: 10
    })
  });

  JoinRequest.findOne = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      activityId,
      userId: applicantId,
      status: 'pending'
    })
  });

  await assert.rejects(
    async () => {
      await joinRequestService.requestToJoin({ activityId, userId: applicantId });
    },
    (err) => {
      assert.equal(err.code, 'DUPLICATE_JOIN_REQUEST');
      assert.equal(err.statusCode, 409);
      return true;
    }
  );

  Activity.findById = originalFindById;
  JoinRequest.findOne = originalFindOne;
});

test('decideJoinRequest enforces organizer-only decisions and self-approval block', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const differentUserId = new mongoose.Types.ObjectId();
  const applicantId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();

  const originalFindReq = JoinRequest.findById;
  const originalFindAct = Activity.findById;

  JoinRequest.findById = () => ({
    exec: async () => ({
      _id: requestId,
      activityId,
      userId: applicantId,
      status: 'pending'
    })
  });

  Activity.findById = () => ({
    exec: async () => ({
      _id: activityId,
      organizerId,
      status: 'published',
      capacity: 10,
      placesFilled: 5
    })
  });

  // Non-organizer attempt fails with 403
  await assert.rejects(
    async () => {
      await joinRequestService.decideJoinRequest({
        requestId,
        decision: 'approved',
        currentUserId: differentUserId
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  JoinRequest.findById = originalFindReq;
  Activity.findById = originalFindAct;
});

test('cancelJoinRequest allows applicant to cancel and decrements capacity if approved', async () => {
  const applicantId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();
  const requestId = new mongoose.Types.ObjectId();

  let decremented = false;
  const originalFindReq = JoinRequest.findById;
  const originalFindOneAndUpdate = JoinRequest.findOneAndUpdate;
  const originalUpdateAct = Activity.updateOne;

  JoinRequest.findById = () => ({
    exec: async () => ({
      _id: requestId,
      activityId,
      userId: applicantId,
      status: 'approved'
    })
  });

  JoinRequest.findOneAndUpdate = () => ({
    exec: async () => ({
      _id: requestId,
      activityId,
      userId: applicantId,
      status: 'approved'
    })
  });

  Activity.updateOne = (filter, update) => {
    if (update.$inc && update.$inc.placesFilled === -1) {
      decremented = true;
    }
    return { exec: async () => ({ modifiedCount: 1 }) };
  };

  const cancelled = await joinRequestService.cancelJoinRequest({
    requestId,
    currentUserId: applicantId
  });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(decremented, true, 'Should atomically decrement placesFilled when approved request is cancelled');

  JoinRequest.findById = originalFindReq;
  JoinRequest.findOneAndUpdate = originalFindOneAndUpdate;
  Activity.updateOne = originalUpdateAct;
});

