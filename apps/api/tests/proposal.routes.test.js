const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Proposal = require('../src/models/Proposal');
const InterestRequest = require('../src/models/InterestRequest');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');

const proposerId = new mongoose.Types.ObjectId();
const recipientId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

const proposerApp = createApp({
  authMiddleware: (req, res, next) => {
    req.user = { id: proposerId.toString() };
    next();
  }
});

const recipientApp = createApp({
  authMiddleware: (req, res, next) => {
    req.user = { id: recipientId.toString() };
    next();
  }
});

const strangerApp = createApp({
  authMiddleware: (req, res, next) => {
    req.user = { id: strangerId.toString() };
    next();
  }
});

function getValidProposalPayload(targetRequestId) {
  return {
    targetRequestId: targetRequestId.toString(),
    activityDraft: {
      title: 'Joint Hiking Trail',
      description: 'Let us hike together this coming Sunday morning.',
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
      location: {
        type: 'Point',
        coordinates: [-73.968, 40.785]
      },
      displayArea: 'North Woods Trailhead',
      capacity: 4,
      budget: 0,
      skillLevel: 'all-levels'
    }
  };
}

test('POST /api/interest-requests/:id/proposals rejects proposing to self with 400', async () => {
  const sourceId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();

  const originalFindById = InterestRequest.findById;
  InterestRequest.findById = (id) => ({
    exec: async () => {
      if (id.toString() === sourceId.toString()) {
        return { _id: sourceId, userId: proposerId, status: 'active', category: 'outdoor' };
      }
      if (id.toString() === targetId.toString()) {
        return { _id: targetId, userId: proposerId, status: 'active', category: 'outdoor' }; // Same user!
      }
      return null;
    }
  });

  const res = await request(proposerApp)
    .post(`/api/interest-requests/${sourceId}/proposals`)
    .send(getValidProposalPayload(targetId))
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'SELF_PROPOSAL_FORBIDDEN');

  InterestRequest.findById = originalFindById;
});

test('POST /api/interest-requests/:id/proposals creates proposal and locks both requests', async () => {
  const sourceId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  const proposalId = new mongoose.Types.ObjectId();

  const originalFindById = InterestRequest.findById;
  const originalFindOneProp = Proposal.findOne;
  const originalFindOneAndUpdate = InterestRequest.findOneAndUpdate;
  const originalSaveProp = Proposal.prototype.save;
  const originalUpdateReq = InterestRequest.updateOne;

  let sourceLocked = false;
  let targetLocked = false;

  InterestRequest.findById = (id) => ({
    exec: async () => {
      if (id.toString() === sourceId.toString()) {
        return { _id: sourceId, userId: proposerId, status: 'active', category: 'outdoor' };
      }
      if (id.toString() === targetId.toString()) {
        return { _id: targetId, userId: recipientId, status: 'active', category: 'outdoor' };
      }
      return null;
    }
  });

  Proposal.findOne = () => ({
    exec: async () => null // no existing pending proposal
  });

  InterestRequest.findOneAndUpdate = (filter, update) => ({
    exec: async () => {
      if (filter._id.toString() === sourceId.toString()) {
        sourceLocked = true;
        return { _id: sourceId, userId: proposerId, status: 'proposed' };
      }
      if (filter._id.toString() === targetId.toString()) {
        targetLocked = true;
        return { _id: targetId, userId: recipientId, status: 'proposed' };
      }
      return null;
    }
  });

  Proposal.prototype.save = async function () {
    this._id = proposalId;
    return this;
  };

  InterestRequest.updateOne = (filter, update) => {
    return { exec: async () => ({ modifiedCount: 1 }) };
  };

  const res = await request(proposerApp)
    .post(`/api/interest-requests/${sourceId}/proposals`)
    .send(getValidProposalPayload(targetId))
    .expect(201);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'pending');
  assert.equal(sourceLocked, true, 'Source request must be locked to proposed');
  assert.equal(targetLocked, true, 'Target request must be locked to proposed');

  InterestRequest.findById = originalFindById;
  Proposal.findOne = originalFindOneProp;
  InterestRequest.findOneAndUpdate = originalFindOneAndUpdate;
  Proposal.prototype.save = originalSaveProp;
  InterestRequest.updateOne = originalUpdateReq;
});

test('PATCH /api/proposals/:id rejects decision from proposer with 403 FORBIDDEN', async () => {
  const proposalId = new mongoose.Types.ObjectId();

  const originalFindById = Proposal.findById;
  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      proposerId,
      recipientId,
      status: 'pending'
    })
  });

  // Proposer attempts to accept own proposal
  const res = await request(proposerApp)
    .patch(`/api/proposals/${proposalId}`)
    .send({ decision: 'accepted' })
    .expect(403);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  Proposal.findById = originalFindById;
});

test('PATCH /api/proposals/:id recipient accepts proposal, creates draft Activity & approved JoinRequest', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const sourceReqId = new mongoose.Types.ObjectId();
  const targetReqId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();

  const mockProposal = {
    _id: proposalId,
    proposerId,
    recipientId,
    sourceRequestId: sourceReqId,
    targetRequestId: targetReqId,
    status: 'pending',
    activityDraft: {
      title: 'Joint Hiking Trail',
      description: 'Let us hike together this coming Sunday morning.',
      category: 'outdoor',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'North Woods Trailhead',
      capacity: 4,
      budget: 0,
      skillLevel: 'all-levels'
    },
    save: async function () { return this; }
  };

  const originalFindByIdProp = Proposal.findById;
  const originalFindOneAndUpdateProp = Proposal.findOneAndUpdate;
  const originalFindByIdReq = InterestRequest.findById;
  const originalSaveAct = Activity.prototype.save;
  const originalSaveJoin = JoinRequest.prototype.save;
  const originalUpdateReq = InterestRequest.updateOne;

  let activityCreated = false;
  let joinRequestCreated = false;
  let convertedCount = 0;

  Proposal.findById = () => ({
    exec: async () => mockProposal
  });

  InterestRequest.findById = () => ({
    exec: async () => ({ status: 'proposed' })
  });

  Proposal.findOneAndUpdate = () => ({
    exec: async () => ({ ...mockProposal, status: 'accepted' })
  });

  Activity.prototype.save = async function () {
    this._id = activityId;
    activityCreated = true;
    assert.equal(this.organizerId.toString(), proposerId.toString(), 'Proposer must be the organizer');
    assert.equal(this.status, 'draft', 'Activity must be in draft status');
    assert.equal(this.placesFilled, 1, 'placesFilled must be 1 for confirmed recipient');
    return this;
  };

  JoinRequest.prototype.save = async function () {
    joinRequestCreated = true;
    assert.equal(this.userId.toString(), recipientId.toString(), 'JoinRequest must belong to recipient');
    assert.equal(this.status, 'approved', 'JoinRequest must be approved');
    return this;
  };

  InterestRequest.updateOne = () => {
    convertedCount++;
    return { exec: async () => ({ modifiedCount: 1 }) };
  };

  const res = await request(recipientApp)
    .patch(`/api/proposals/${proposalId}`)
    .send({ decision: 'accepted' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(activityCreated, true);
  assert.equal(joinRequestCreated, true);
  assert.equal(convertedCount, 2, 'Both interest requests must be converted');

  Proposal.findById = originalFindByIdProp;
  Proposal.findOneAndUpdate = originalFindOneAndUpdateProp;
  InterestRequest.findById = originalFindByIdReq;
  Activity.prototype.save = originalSaveAct;
  JoinRequest.prototype.save = originalSaveJoin;
  InterestRequest.updateOne = originalUpdateReq;
});

test('POST /api/proposals/:id/cancel allows proposer to cancel and unlocks interest requests', async () => {
  const proposalId = new mongoose.Types.ObjectId();
  const sourceReqId = new mongoose.Types.ObjectId();
  const targetReqId = new mongoose.Types.ObjectId();

  const originalFindByIdProp = Proposal.findById;
  const originalFindOneAndUpdateProp = Proposal.findOneAndUpdate;
  const originalUpdateReq = InterestRequest.updateOne;

  let unlockedCount = 0;

  Proposal.findById = () => ({
    exec: async () => ({
      _id: proposalId,
      proposerId,
      recipientId,
      sourceRequestId: sourceReqId,
      targetRequestId: targetReqId,
      status: 'pending'
    })
  });

  Proposal.findOneAndUpdate = () => ({
    exec: async () => ({
      _id: proposalId,
      status: 'cancelled'
    })
  });

  InterestRequest.updateOne = (filter, update) => {
    if (update.status === 'active') {
      unlockedCount++;
    }
    return { exec: async () => ({ modifiedCount: 1 }) };
  };

  const res = await request(proposerApp)
    .post(`/api/proposals/${proposalId}/cancel`)
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'cancelled');
  assert.equal(unlockedCount, 2, 'Both requests must be unlocked back to active');

  Proposal.findById = originalFindByIdProp;
  Proposal.findOneAndUpdate = originalFindOneAndUpdateProp;
  InterestRequest.updateOne = originalUpdateReq;
});
