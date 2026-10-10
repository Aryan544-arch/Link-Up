const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InterestRequest = require('../src/models/InterestRequest');
const Proposal = require('../src/models/Proposal');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const interestRequestService = require('../src/services/interestRequest.service');
const proposalService = require('../src/services/proposal.service');

test('Real MongoDB concurrency: simultaneous duplicate active interest requests are prevented', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_phase5_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await InterestRequest.deleteMany({});
    await InterestRequest.syncIndexes();

    const userId = new mongoose.Types.ObjectId();
    const payload = {
      category: 'outdoor',
      title: 'Trail Run',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      radiusKm: 5,
      maxBudget: 0,
      skillLevel: 'all-levels',
      groupSize: 4
    };

    // Fire 3 simultaneous create requests for the same user & category
    const results = await Promise.allSettled([
      interestRequestService.createInterestRequest({ payload, userId }),
      interestRequestService.createInterestRequest({ payload, userId }),
      interestRequestService.createInterestRequest({ payload, userId })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one interest request must be created');
    assert.equal(rejected.length, 2, 'Simultaneous duplicates must be rejected');
    assert.equal(rejected[0].reason.code, 'DUPLICATE_INTEREST_REQUEST');
    assert.equal(rejected[1].reason.code, 'DUPLICATE_INTEREST_REQUEST');

    // Confirm only 1 active document exists in MongoDB
    const activeDocs = await InterestRequest.find({ userId, category: 'outdoor', status: 'active' });
    assert.equal(activeDocs.length, 1);
  } finally {
    if (isConnected) {
      try {
        await InterestRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: simultaneous proposal creation between same requests is prevented', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_phase5_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await InterestRequest.deleteMany({});
    await Proposal.deleteMany({});
    await InterestRequest.syncIndexes();
    await Proposal.syncIndexes();

    const proposerId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();

    const sourceReq = new InterestRequest({
      userId: proposerId,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      status: 'active'
    });
    await sourceReq.save();

    const targetReq = new InterestRequest({
      userId: recipientId,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.970, 40.786] },
      displayArea: 'Central Park West',
      status: 'active'
    });
    await targetReq.save();

    const proposalPayload = {
      targetRequestId: targetReq._id.toString(),
      activityDraft: {
        title: 'Joint Trail Run',
        description: 'Hike together through Central Park.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park North',
        capacity: 4
      }
    };

    // Fire 2 simultaneous proposal creation calls
    const results = await Promise.allSettled([
      proposalService.createProposal({
        sourceRequestId: sourceReq._id,
        payload: proposalPayload,
        proposerId
      }),
      proposalService.createProposal({
        sourceRequestId: sourceReq._id,
        payload: proposalPayload,
        proposerId
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one proposal must be created');
    assert.equal(rejected.length, 1, 'Duplicate proposal attempt must be rejected');

    const pendingProps = await Proposal.find({
      sourceRequestId: sourceReq._id,
      targetRequestId: targetReq._id,
      status: 'pending'
    });
    assert.equal(pendingProps.length, 1);
  } finally {
    if (isConnected) {
      try {
        await InterestRequest.deleteMany({});
        await Proposal.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: simultaneous proposal decision and cancellation race is handled atomically', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_phase5_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await InterestRequest.deleteMany({});
    await Proposal.deleteMany({});
    await Activity.deleteMany({});
    await JoinRequest.deleteMany({});

    const proposerId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();

    const sourceReq = new InterestRequest({
      userId: proposerId,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      status: 'proposed'
    });
    await sourceReq.save();

    const targetReq = new InterestRequest({
      userId: recipientId,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.970, 40.786] },
      displayArea: 'Central Park West',
      status: 'proposed'
    });
    await targetReq.save();

    const proposal = new Proposal({
      proposerId,
      recipientId,
      sourceRequestId: sourceReq._id,
      targetRequestId: targetReq._id,
      activityDraft: {
        title: 'Joint Hike',
        description: 'Hike together this weekend.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park',
        capacity: 4
      },
      status: 'pending'
    });
    await proposal.save();

    // Recipient accepts while proposer concurrently cancels
    const results = await Promise.allSettled([
      proposalService.decideProposal({
        proposalId: proposal._id,
        decision: 'accepted',
        currentUserId: recipientId
      }),
      proposalService.cancelProposal({
        proposalId: proposal._id,
        currentUserId: proposerId
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one state transition must succeed');
    assert.equal(rejected.length, 1, 'The losing operation must fail with state transition error');
    assert.equal(rejected[0].reason.code, 'INVALID_STATE_TRANSITION');

    // Confirm proposal state in MongoDB
    const finalProp = await Proposal.findById(proposal._id);
    assert.ok(
      finalProp.status === 'accepted' || finalProp.status === 'cancelled',
      'Proposal must end in either accepted or cancelled status'
    );
  } finally {
    if (isConnected) {
      try {
        await InterestRequest.deleteMany({});
        await Proposal.deleteMany({});
        await Activity.deleteMany({});
        await JoinRequest.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

test('Real MongoDB concurrency: two different proposers targeting the same recipient request simultaneously', async (t) => {
  let isConnected = false;
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/meetup_pulse_phase5_concurrency', {
      serverSelectionTimeoutMS: 1500
    });
    isConnected = true;
  } catch (err) {
    t.skip('Local MongoDB not reachable; skipping live database test');
    return;
  }

  try {
    await InterestRequest.deleteMany({});
    await Proposal.deleteMany({});
    await InterestRequest.syncIndexes();
    await Proposal.syncIndexes();

    const user1 = new mongoose.Types.ObjectId();
    const user2 = new mongoose.Types.ObjectId();
    const recipient = new mongoose.Types.ObjectId();

    const sourceReq1 = new InterestRequest({
      userId: user1,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.968, 40.785] },
      displayArea: 'Central Park',
      status: 'active'
    });
    await sourceReq1.save();

    const sourceReq2 = new InterestRequest({
      userId: user2,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.970, 40.786] },
      displayArea: 'Central Park West',
      status: 'active'
    });
    await sourceReq2.save();

    const targetReq = new InterestRequest({
      userId: recipient,
      category: 'outdoor',
      timeStart: new Date(Date.now() + 3600000),
      timeEnd: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.965, 40.782] },
      displayArea: 'East Meadow',
      status: 'active'
    });
    await targetReq.save();

    const payload1 = {
      targetRequestId: targetReq._id.toString(),
      activityDraft: {
        title: 'Run with Proposer 1',
        description: 'Morning trail run.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.968, 40.785] },
        displayArea: 'Central Park',
        capacity: 2
      }
    };

    const payload2 = {
      targetRequestId: targetReq._id.toString(),
      activityDraft: {
        title: 'Run with Proposer 2',
        description: 'Morning trail run.',
        category: 'outdoor',
        startsAt: new Date(Date.now() + 3600000),
        endsAt: new Date(Date.now() + 7200000),
        location: { type: 'Point', coordinates: [-73.970, 40.786] },
        displayArea: 'Central Park West',
        capacity: 2
      }
    };

    // Fire 2 simultaneous proposal creation calls targeting the SAME recipient from different users
    const results = await Promise.allSettled([
      proposalService.createProposal({
        sourceRequestId: sourceReq1._id,
        payload: payload1,
        proposerId: user1
      }),
      proposalService.createProposal({
        sourceRequestId: sourceReq2._id,
        payload: payload2,
        proposerId: user2
      })
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one proposer must succeed');
    assert.equal(rejected.length, 1, 'The competing proposer must be rejected');
    assert.ok(
      rejected[0].reason.code === 'TARGET_REQUEST_ALREADY_CLAIMED' ||
        rejected[0].reason.code === 'ACTIVE_PROPOSAL_EXISTS',
      `Expected conflict code, got ${rejected[0].reason.code}`
    );

    // Verify database integrity
    const allProposals = await Proposal.find({ targetRequestId: targetReq._id });
    assert.equal(allProposals.length, 1, 'Exactly one proposal can exist for target request');

    const winningProposal = allProposals[0];
    const winningSourceId = winningProposal.sourceRequestId.toString();
    const losingSourceId =
      winningSourceId === sourceReq1._id.toString()
        ? sourceReq2._id.toString()
        : sourceReq1._id.toString();

    // The winning source request must be 'proposed'
    const winningReqDoc = await InterestRequest.findById(winningSourceId);
    assert.equal(winningReqDoc.status, 'proposed');

    // The losing source request MUST remain 'active' (not incorrectly locked!)
    const losingReqDoc = await InterestRequest.findById(losingSourceId);
    assert.equal(losingReqDoc.status, 'active', 'Losing proposer request must remain active');

    // The target request must be 'proposed'
    const targetReqDoc = await InterestRequest.findById(targetReq._id);
    assert.equal(targetReqDoc.status, 'proposed');
  } finally {
    if (isConnected) {
      try {
        await InterestRequest.deleteMany({});
        await Proposal.deleteMany({});
      } catch (cleanupErr) {}
      await mongoose.disconnect();
    }
  }
});

