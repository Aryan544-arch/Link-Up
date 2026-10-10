const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const JoinRequest = require('../models/JoinRequest');
const InterestRequest = require('../models/InterestRequest');
const Proposal = require('../models/Proposal');
const { serializeActivity } = require('./activity.service');
const { serializeInterestRequest } = require('./interestRequest.service');

/**
 * Plans Service — MEETUP Pulse
 *
 * Implements "My Plans" dashboard aggregation (PRD Journey G & FR-13).
 * Aggregates organized activities, joined activities, pending join requests,
 * active interest requests, and pending proposals for the authenticated user.
 */
async function getMyPlans({ userId, query = {} }) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const limitPerSection = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);

  // 1. Activities organized by authenticated user (draft, published, cancelled, completed)
  const organizedFilter = { organizerId: userId };
  if (query.organizedStatus) {
    organizedFilter.status = query.organizedStatus;
  }

  const organizedPromise = Activity.find(organizedFilter)
    .sort({ startsAt: 1, _id: 1 })
    .limit(limitPerSection)
    .exec();

  // 2. Activities joined / approved to attend
  const joinedPromise = JoinRequest.find({ userId, status: 'approved' })
    .populate('activityId')
    .sort({ updatedAt: -1, _id: 1 })
    .limit(limitPerSection)
    .exec();

  // 3. Join requests submitted by user awaiting decision
  const pendingRequestsPromise = JoinRequest.find({ userId, status: 'pending' })
    .populate('activityId')
    .sort({ createdAt: -1, _id: 1 })
    .limit(limitPerSection)
    .exec();

  // 4. Relevant interest requests (active or proposed)
  const interestRequestFilter = {
    userId,
    status: { $in: ['active', 'proposed'] }
  };
  if (query.interestStatus) {
    interestRequestFilter.status = query.interestStatus;
  }

  const interestRequestsPromise = InterestRequest.find(interestRequestFilter)
    .sort({ createdAt: -1, _id: 1 })
    .limit(limitPerSection)
    .exec();

  // 5. Relevant proposals (user is proposer or recipient)
  const proposalFilter = {
    $or: [{ proposerId: userId }, { recipientId: userId }],
    status: 'pending'
  };
  if (query.proposalStatus) {
    proposalFilter.status = query.proposalStatus;
  }

  let proposalQuery = Proposal.find(proposalFilter)
    .populate('sourceRequestId')
    .populate('targetRequestId');

  if (mongoose.models && mongoose.models.User) {
    proposalQuery = proposalQuery
      .populate('proposerId', '_id displayName')
      .populate('recipientId', '_id displayName');
  }

  const proposalsPromise = proposalQuery
    .sort({ createdAt: -1, _id: 1 })
    .limit(limitPerSection)
    .exec();

  const [
    rawOrganized,
    rawJoinedRequests,
    rawPendingRequests,
    rawInterestRequests,
    rawProposals
  ] = await Promise.all([
    organizedPromise,
    joinedPromise,
    pendingRequestsPromise,
    interestRequestsPromise,
    proposalsPromise
  ]);

  // Serialize organized activities: User IS organizer -> precise coordinates preserved
  const organized = rawOrganized.map((act) => serializeActivity(act, userId));

  // Serialize joined activities: User is attendee (NOT organizer) -> exact coordinates masked
  // Handle missing/deleted activity references safely
  const joined = [];
  for (const req of rawJoinedRequests) {
    if (req.activityId) {
      joined.push({
        requestId: req._id,
        status: req.status,
        joinedAt: req.updatedAt || req.createdAt,
        activity: serializeActivity(req.activityId, userId)
      });
    }
  }

  // Serialize pending join requests: User is applicant -> exact coordinates masked
  // Handle missing/deleted activity references safely
  const pendingRequests = [];
  for (const req of rawPendingRequests) {
    if (req.activityId) {
      pendingRequests.push({
        requestId: req._id,
        status: req.status,
        note: req.note || null,
        createdAt: req.createdAt,
        activity: serializeActivity(req.activityId, userId)
      });
    }
  }

  // Serialize interest requests: User is creator -> precise coordinates preserved
  const interestRequests = rawInterestRequests.map((ir) =>
    serializeInterestRequest(ir, userId)
  );

  // Serialize proposals: attach role indicator (proposer vs recipient)
  const proposals = rawProposals.map((prop) => {
    const doc = prop.toObject ? prop.toObject() : { ...prop };
    const isProposer =
      doc.proposerId &&
      (doc.proposerId._id
        ? doc.proposerId._id.toString()
        : doc.proposerId.toString()) === userId.toString();

    return {
      ...doc,
      userRole: isProposer ? 'proposer' : 'recipient'
    };
  });

  return {
    organized,
    joined,
    pendingRequests,
    interestRequests,
    proposals,
    summary: {
      organizedCount: organized.length,
      joinedCount: joined.length,
      pendingRequestsCount: pendingRequests.length,
      interestRequestsCount: interestRequests.length,
      proposalsCount: proposals.length,
      totalPlansCount:
        organized.length +
        joined.length +
        pendingRequests.length +
        interestRequests.length +
        proposals.length
    }
  };
}

module.exports = {
  getMyPlans
};
