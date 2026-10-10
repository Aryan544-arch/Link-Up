const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Proposal = require('../src/models/Proposal');
const InterestRequest = require('../src/models/InterestRequest');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const proposalService = require('../src/services/proposal.service');

test('Failure injection: activity creation error rolls back proposal from accepted to pending', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const proposerId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const sourceReqId = new mongoose.Types.ObjectId();
  const targetReqId = new mongoose.Types.ObjectId();

  let proposalStatus = 'pending';

  const originalFindByIdProp = Proposal.findById;
  const originalFindOneAndUpdateProp = Proposal.findOneAndUpdate;
  const originalUpdateOneProp = Proposal.updateOne;
  const originalFindByIdReq = InterestRequest.findById;
  const originalSaveAct = Activity.prototype.save;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      proposerId,
      recipientId,
      sourceRequestId: sourceReqId,
      targetRequestId: targetReqId,
      status: proposalStatus,
      activityDraft: {
        title: 'Trail Hike',
        description: 'Hiking together on Sunday.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park',
        capacity: 2
      }
    })
  });

  InterestRequest.findById = () => ({
    exec: async () => ({ status: 'proposed' })
  });

  Proposal.findOneAndUpdate = (filter, update) => ({
    exec: async () => {
      if (filter._id.toString() === proposalId.toString() && filter.status === 'pending') {
        proposalStatus = update.status;
        return { _id: proposalId, status: proposalStatus };
      }
      return null;
    }
  });

  Proposal.updateOne = (filter, update) => ({
    exec: async () => {
      if (filter._id.toString() === proposalId.toString()) {
        proposalStatus = update.status;
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    }
  });

  // Inject failure during Activity save
  Activity.prototype.save = async function () {
    throw new Error('DATABASE_CONNECTION_LOST_DURING_ACTIVITY_SAVE');
  };

  await assert.rejects(
    async () => {
      await proposalService.decideProposal({
        proposalId,
        decision: 'accepted',
        currentUserId: recipientId
      });
    },
    /DATABASE_CONNECTION_LOST_DURING_ACTIVITY_SAVE/
  );

  // Assert compensating rollback reverted proposal back to pending
  assert.equal(proposalStatus, 'pending', 'Proposal must be rolled back to pending after activity creation failure');

  Proposal.findById = originalFindByIdProp;
  Proposal.findOneAndUpdate = originalFindOneAndUpdateProp;
  Proposal.updateOne = originalUpdateOneProp;
  InterestRequest.findById = originalFindByIdReq;
  Activity.prototype.save = originalSaveAct;
});

test('Failure injection: joinRequest creation error deletes created activity and rolls back proposal to pending', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const proposerId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const sourceReqId = new mongoose.Types.ObjectId();
  const targetReqId = new mongoose.Types.ObjectId();

  let proposalStatus = 'pending';
  let activityDeleted = false;

  const originalFindByIdProp = Proposal.findById;
  const originalFindOneAndUpdateProp = Proposal.findOneAndUpdate;
  const originalUpdateOneProp = Proposal.updateOne;
  const originalFindByIdReq = InterestRequest.findById;
  const originalSaveAct = Activity.prototype.save;
  const originalDeleteOneAct = Activity.deleteOne;
  const originalSaveJoin = JoinRequest.prototype.save;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      proposerId,
      recipientId,
      sourceRequestId: sourceReqId,
      targetRequestId: targetReqId,
      status: proposalStatus,
      activityDraft: {
        title: 'Trail Hike',
        description: 'Hiking together on Sunday.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park',
        capacity: 2
      }
    })
  });

  InterestRequest.findById = () => ({
    exec: async () => ({ status: 'proposed' })
  });

  Proposal.findOneAndUpdate = (filter, update) => ({
    exec: async () => {
      proposalStatus = update.status;
      return { _id: proposalId, status: proposalStatus };
    }
  });

  Proposal.updateOne = (filter, update) => ({
    exec: async () => {
      proposalStatus = update.status;
      return { modifiedCount: 1 };
    }
  });

  Activity.prototype.save = async function () {
    this._id = new mongoose.Types.ObjectId();
    return this;
  };

  Activity.deleteOne = () => ({
    exec: async () => {
      activityDeleted = true;
      return { deletedCount: 1 };
    }
  });

  // Inject failure during JoinRequest save
  JoinRequest.prototype.save = async function () {
    throw new Error('DATABASE_WRITE_ERROR_JOIN_REQUEST');
  };

  await assert.rejects(
    async () => {
      await proposalService.decideProposal({
        proposalId,
        decision: 'accepted',
        currentUserId: recipientId
      });
    },
    /DATABASE_WRITE_ERROR_JOIN_REQUEST/
  );

  assert.equal(activityDeleted, true, 'Created activity must be deleted on joinRequest save failure');
  assert.equal(proposalStatus, 'pending', 'Proposal must be rolled back to pending');

  Proposal.findById = originalFindByIdProp;
  Proposal.findOneAndUpdate = originalFindOneAndUpdateProp;
  Proposal.updateOne = originalUpdateOneProp;
  InterestRequest.findById = originalFindByIdReq;
  Activity.prototype.save = originalSaveAct;
  Activity.deleteOne = originalDeleteOneAct;
  JoinRequest.prototype.save = originalSaveJoin;
});

test('Elapsed start time: proposal acceptance is rejected if proposed startsAt has elapsed', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();

  const originalFindByIdProp = Proposal.findById;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      recipientId,
      status: 'pending',
      activityDraft: {
        title: 'Past Hike',
        startsAt: new Date(Date.now() - 3600000), // In the past!
        endsAt: new Date(Date.now() + 3600000)
      }
    })
  });

  await assert.rejects(
    async () => {
      await proposalService.decideProposal({
        proposalId,
        decision: 'accepted',
        currentUserId: recipientId
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_ACTIVITY_TIME');
      return true;
    }
  );

  Proposal.findById = originalFindByIdProp;
});

test('Capacity boundary: proposal with capacity 1 creates 1-on-1 activity with placesFilled 1', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const proposerId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const sourceReqId = new mongoose.Types.ObjectId();
  const targetReqId = new mongoose.Types.ObjectId();

  let savedActivity = null;

  const originalFindByIdProp = Proposal.findById;
  const originalFindOneAndUpdateProp = Proposal.findOneAndUpdate;
  const originalFindByIdReq = InterestRequest.findById;
  const originalSaveAct = Activity.prototype.save;
  const originalSaveJoin = JoinRequest.prototype.save;
  const originalUpdateReq = InterestRequest.updateOne;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      proposerId,
      recipientId,
      sourceRequestId: sourceReqId,
      targetRequestId: targetReqId,
      status: 'pending',
      activityDraft: {
        title: '1-on-1 Tennis Match',
        description: 'Tennis practice match on Sunday.',
        category: 'sports',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park Courts',
        capacity: 1 // Valid 1-on-1 match!
      },
      save: async function () { return this; }
    })
  });

  InterestRequest.findById = () => ({
    exec: async () => ({ status: 'proposed' })
  });

  Proposal.findOneAndUpdate = () => ({
    exec: async () => ({ status: 'accepted', save: async function () { return this; } })
  });

  Activity.prototype.save = async function () {
    savedActivity = this;
    return this;
  };

  JoinRequest.prototype.save = async function () {
    return this;
  };

  InterestRequest.updateOne = () => ({
    exec: async () => ({ modifiedCount: 1 })
  });

  const result = await proposalService.decideProposal({
    proposalId,
    decision: 'accepted',
    currentUserId: recipientId
  });

  assert.ok(result.activity);
  assert.equal(savedActivity.capacity, 1, 'Capacity 1 must be preserved on activity');
  assert.equal(savedActivity.placesFilled, 1, 'placesFilled must be 1');

  Proposal.findById = originalFindByIdProp;
  Proposal.findOneAndUpdate = originalFindOneAndUpdateProp;
  InterestRequest.findById = originalFindByIdReq;
  Activity.prototype.save = originalSaveAct;
  JoinRequest.prototype.save = originalSaveJoin;
  InterestRequest.updateOne = originalUpdateReq;
});

test('Stale state: proposal acceptance fails if associated interest requests are no longer in proposed state', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();

  const originalFindByIdProp = Proposal.findById;
  const originalFindByIdReq = InterestRequest.findById;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      recipientId,
      sourceRequestId: new mongoose.Types.ObjectId(),
      targetRequestId: new mongoose.Types.ObjectId(),
      status: 'pending',
      activityDraft: {
        title: 'Trail Hike',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000)
      }
    })
  });

  // Source request is no longer proposed (e.g. withdrawn by user)
  InterestRequest.findById = (id) => ({
    exec: async () => ({ status: 'withdrawn' })
  });

  await assert.rejects(
    async () => {
      await proposalService.decideProposal({
        proposalId,
        decision: 'accepted',
        currentUserId: recipientId
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.code, 'INVALID_STATE_TRANSITION');
      return true;
    }
  );

  Proposal.findById = originalFindByIdProp;
  InterestRequest.findById = originalFindByIdReq;
});
