const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const plansService = require('../src/services/plans.service');
const Activity = require('../src/models/Activity');
const JoinRequest = require('../src/models/JoinRequest');
const InterestRequest = require('../src/models/InterestRequest');
const Proposal = require('../src/models/Proposal');

const userId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

function getMockActivity(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: 'Morning Trail Run',
    description: 'A brisk run along the ridge trail.',
    category: 'outdoor',
    organizerId: userId,
    startsAt: new Date(Date.now() + 3600000),
    endsAt: new Date(Date.now() + 7200000),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park North',
    capacity: 5,
    placesFilled: 1,
    budget: 0,
    skillLevel: 'all-levels',
    approvalRequired: true,
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() {
      return { ...this };
    },
    ...overrides
  };
}

function getMockInterestRequest(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    userId,
    category: 'outdoor',
    title: 'Trail Run Partner',
    timeStart: new Date(Date.now() + 3600000),
    timeEnd: new Date(Date.now() + 7200000),
    location: {
      type: 'Point',
      coordinates: [-73.968, 40.785]
    },
    displayArea: 'Central Park',
    radiusKm: 5,
    maxBudget: 0,
    skillLevel: 'all-levels',
    groupSize: 2,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() {
      return { ...this };
    },
    ...overrides
  };
}

function getMockProposal(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    proposerId: userId,
    recipientId: otherUserId,
    sourceRequestId: new mongoose.Types.ObjectId(),
    targetRequestId: new mongoose.Types.ObjectId(),
    activityDraft: {
      title: 'Joint Trail Run',
      description: 'Run together this weekend',
      category: 'outdoor',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: {
        type: 'Point',
        coordinates: [-73.968, 40.785]
      },
      displayArea: 'Central Park',
      capacity: 2,
      budget: 0,
      skillLevel: 'all-levels'
    },
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject() {
      return { ...this };
    },
    ...overrides
  };
}

function createQueryMock(data = []) {
  const q = {
    sort: () => q,
    limit: () => q,
    skip: () => q,
    populate: () => q,
    exec: async () => data
  };
  return q;
}

test('plansService.getMyPlans throws 401 when userId is missing', async () => {
  await assert.rejects(
    async () => {
      await plansService.getMyPlans({ userId: null });
    },
    (err) => {
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, 'UNAUTHORIZED');
      return true;
    }
  );
});

test('plansService.getMyPlans returns empty state when user has no plans', async () => {
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  Activity.find = () => createQueryMock([]);
  JoinRequest.find = () => createQueryMock([]);
  InterestRequest.find = () => createQueryMock([]);
  Proposal.find = () => createQueryMock([]);

  try {
    const res = await plansService.getMyPlans({ userId });

    assert.deepEqual(res.organized, []);
    assert.deepEqual(res.joined, []);
    assert.deepEqual(res.pendingRequests, []);
    assert.deepEqual(res.interestRequests, []);
    assert.deepEqual(res.proposals, []);
    assert.deepEqual(res.summary, {
      organizedCount: 0,
      joinedCount: 0,
      pendingRequestsCount: 0,
      interestRequestsCount: 0,
      proposalsCount: 0,
      totalPlansCount: 0
    });
  } finally {
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  }
});

test('plansService.getMyPlans aggregates all 5 groups with correct location privacy and user roles', async () => {
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  const mockOrganized = getMockActivity({ organizerId: userId });
  const otherOrganizerActivity = getMockActivity({
    organizerId: otherUserId,
    title: 'Yoga Class'
  });

  const mockJoinedReq = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    status: 'approved',
    activityId: otherOrganizerActivity,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockPendingReq = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    status: 'pending',
    note: 'Excited to join!',
    activityId: otherOrganizerActivity,
    createdAt: new Date()
  };

  const mockInterest = getMockInterestRequest();

  // User is proposer in prop1, recipient in prop2
  const mockProp1 = getMockProposal({ proposerId: userId, recipientId: otherUserId });
  const mockProp2 = getMockProposal({ proposerId: otherUserId, recipientId: userId });

  Activity.find = () => createQueryMock([mockOrganized]);

  JoinRequest.find = (filter) => {
    if (filter.status === 'approved') return createQueryMock([mockJoinedReq]);
    if (filter.status === 'pending') return createQueryMock([mockPendingReq]);
    return createQueryMock([]);
  };

  InterestRequest.find = () => createQueryMock([mockInterest]);

  Proposal.find = () => createQueryMock([mockProp1, mockProp2]);

  try {
    const result = await plansService.getMyPlans({ userId });

    // 1. Organized: user is organizer -> precise coordinates preserved
    assert.equal(result.organized.length, 1);
    assert.equal(result.organized[0].location.isPrecise, true);
    assert.ok(result.organized[0].location.coordinates);
    assert.equal(result.organized[0].title, 'Morning Trail Run');

    // 2. Joined: user is attendee -> precise coordinates masked (null)
    assert.equal(result.joined.length, 1);
    assert.equal(result.joined[0].activity.location.isPrecise, false);
    assert.equal(result.joined[0].activity.location.coordinates, null);
    assert.equal(result.joined[0].status, 'approved');

    // 3. Pending requests: user is applicant -> precise coordinates masked (null)
    assert.equal(result.pendingRequests.length, 1);
    assert.equal(result.pendingRequests[0].activity.location.isPrecise, false);
    assert.equal(result.pendingRequests[0].activity.location.coordinates, null);
    assert.equal(result.pendingRequests[0].note, 'Excited to join!');

    // 4. Interest requests: user is creator -> precise coordinates preserved
    assert.equal(result.interestRequests.length, 1);
    assert.equal(result.interestRequests[0].location.isPrecise, true);
    assert.ok(result.interestRequests[0].location.coordinates);

    // 5. Proposals: roles identified correctly
    assert.equal(result.proposals.length, 2);
    assert.equal(result.proposals[0].userRole, 'proposer');
    assert.equal(result.proposals[1].userRole, 'recipient');

    // Summary counts
    assert.equal(result.summary.organizedCount, 1);
    assert.equal(result.summary.joinedCount, 1);
    assert.equal(result.summary.pendingRequestsCount, 1);
    assert.equal(result.summary.interestRequestsCount, 1);
    assert.equal(result.summary.proposalsCount, 2);
    assert.equal(result.summary.totalPlansCount, 6);
  } finally {
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  }
});

test('plansService.getMyPlans safely skips null/deleted activity references in JoinRequests', async () => {
  const origActivityFind = Activity.find;
  const origJoinFind = JoinRequest.find;
  const origInterestFind = InterestRequest.find;
  const origProposalFind = Proposal.find;

  // Simulate join request pointing to deleted activity (activityId is null)
  const orphanedJoinReq = {
    _id: new mongoose.Types.ObjectId(),
    userId,
    status: 'approved',
    activityId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  Activity.find = () => createQueryMock([]);
  JoinRequest.find = () => createQueryMock([orphanedJoinReq]);
  InterestRequest.find = () => createQueryMock([]);
  Proposal.find = () => createQueryMock([]);

  try {
    const result = await plansService.getMyPlans({ userId });

    // Orphaned request with activityId: null must be omitted without crashing
    assert.equal(result.joined.length, 0);
    assert.equal(result.summary.joinedCount, 0);
  } finally {
    Activity.find = origActivityFind;
    JoinRequest.find = origJoinFind;
    InterestRequest.find = origInterestFind;
    Proposal.find = origProposalFind;
  }
});
