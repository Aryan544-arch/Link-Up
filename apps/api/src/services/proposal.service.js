const Proposal = require('../models/Proposal');
const InterestRequest = require('../models/InterestRequest');
const Activity = require('../models/Activity');
const JoinRequest = require('../models/JoinRequest');
const { dispatchNotificationAsync } = require('./notification.service');

/**
 * Creates a proposal targeting a matched interest request.
 * Atomically locks both interest requests to 'proposed' status to prevent conflicting proposals.
 */
async function createProposal({ sourceRequestId, payload, proposerId }) {
  if (!proposerId) {
    const err = new Error('Authentication required to create a proposal.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (sourceRequestId.toString() === payload.targetRequestId.toString()) {
    const err = new Error('Cannot create proposal targeting the same interest request.');
    err.statusCode = 400;
    err.code = 'SELF_PROPOSAL_FORBIDDEN';
    throw err;
  }

  const sourceRequest = await InterestRequest.findById(sourceRequestId).exec();
  if (!sourceRequest) {
    const err = new Error('Source interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  // Enforce ownership of source request
  if (sourceRequest.userId.toString() !== proposerId.toString()) {
    const err = new Error('You can only create proposals for your own interest requests.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (sourceRequest.status !== 'active') {
    const err = new Error(`Cannot propose from a request in ${sourceRequest.status} status.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  const targetRequest = await InterestRequest.findById(payload.targetRequestId).exec();
  if (!targetRequest) {
    const err = new Error('Target interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  // Prevent self-proposal
  if (targetRequest.userId.toString() === proposerId.toString()) {
    const err = new Error('You cannot create a proposal targeting your own interest request.');
    err.statusCode = 400;
    err.code = 'SELF_PROPOSAL_FORBIDDEN';
    throw err;
  }

  if (targetRequest.status !== 'active') {
    const err = new Error('Target request is currently unavailable or already claimed by another proposal.');
    err.statusCode = 409;
    err.code = 'TARGET_REQUEST_ALREADY_CLAIMED';
    throw err;
  }

  // Check for existing pending proposal on target or source request
  const existingProposal = await Proposal.findOne({
    $or: [
      { targetRequestId: targetRequest._id, status: 'pending' },
      { sourceRequestId: sourceRequest._id, status: 'pending' }
    ]
  }).exec();

  if (existingProposal) {
    const err = new Error('A pending proposal already exists for this interest request.');
    err.statusCode = 409;
    err.code = 'ACTIVE_PROPOSAL_EXISTS';
    throw err;
  }

  // STEP 1: Atomically claim target request from 'active' to 'proposed'
  const lockedTarget = await InterestRequest.findOneAndUpdate(
    {
      _id: targetRequest._id,
      status: 'active',
      userId: { $ne: proposerId }
    },
    {
      $set: { status: 'proposed' }
    },
    { new: true }
  ).exec();

  if (!lockedTarget) {
    const err = new Error('Target request is currently unavailable or already claimed by another proposal.');
    err.statusCode = 409;
    err.code = 'TARGET_REQUEST_ALREADY_CLAIMED';
    throw err;
  }

  // STEP 2: Atomically claim source request from 'active' to 'proposed'
  let lockedSource;
  try {
    lockedSource = await InterestRequest.findOneAndUpdate(
      {
        _id: sourceRequest._id,
        status: 'active',
        userId: proposerId
      },
      {
        $set: { status: 'proposed' }
      },
      { new: true }
    ).exec();

    if (!lockedSource) {
      // Revert target lock
      await InterestRequest.updateOne(
        { _id: targetRequest._id, status: 'proposed' },
        { $set: { status: 'active' } }
      ).exec();

      const err = new Error(`Source request is no longer active (status: ${sourceRequest.status}).`);
      err.statusCode = 409;
      err.code = 'SOURCE_REQUEST_ALREADY_CLAIMED';
      throw err;
    }
  } catch (sourceErr) {
    // Revert target lock on unexpected error
    await InterestRequest.updateOne(
      { _id: targetRequest._id, status: 'proposed' },
      { $set: { status: 'active' } }
    ).exec();
    throw sourceErr;
  }

  // STEP 3: Create and persist proposal
  const proposal = new Proposal({
    proposerId,
    recipientId: targetRequest.userId,
    sourceRequestId: sourceRequest._id,
    targetRequestId: targetRequest._id,
    activityDraft: {
      ...payload.activityDraft,
      category: sourceRequest.category
    },
    status: 'pending'
  });

  try {
    await proposal.save();
  } catch (saveErr) {
    // Revert BOTH claims on save failure
    await InterestRequest.updateOne(
      { _id: targetRequest._id, status: 'proposed' },
      { $set: { status: 'active' } }
    ).exec();
    await InterestRequest.updateOne(
      { _id: sourceRequest._id, status: 'proposed' },
      { $set: { status: 'active' } }
    ).exec();

    if (saveErr.code === 11000) {
      const dupErr = new Error('A pending proposal already exists for this interest request.');
      dupErr.statusCode = 409;
      dupErr.code = 'ACTIVE_PROPOSAL_EXISTS';
      throw dupErr;
    }
    throw saveErr;
  }

  // Asynchronously notify target user of incoming activity proposal
  dispatchNotificationAsync({
    recipientId: targetRequest.userId,
    type: 'PROPOSAL_RECEIVED',
    title: 'New Activity Proposal',
    message: `You received an activity proposal for "${targetRequest.category}"!`,
    relatedResourceId: proposal._id,
    relatedResourceType: 'proposal'
  });

  return proposal;
}

/**
 * Lists proposals for the authenticated user.
 */
async function getProposals({ userId, query = {} }) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const filter = {};
  if (query.role === 'proposer') {
    filter.proposerId = userId;
  } else if (query.role === 'recipient') {
    filter.recipientId = userId;
  } else {
    filter.$or = [{ proposerId: userId }, { recipientId: userId }];
  }

  if (query.status) {
    filter.status = query.status;
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [proposals, total] = await Promise.all([
    Proposal.find(filter)
      .populate('proposerId', '_id displayName')
      .populate('recipientId', '_id displayName')
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Proposal.countDocuments(filter).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    proposals,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
}

/**
 * Retrieves a proposal by ID with authorization check.
 */
async function getProposalById({ proposalId, currentUserId }) {
  const proposal = await Proposal.findById(proposalId)
    .populate('proposerId', '_id displayName')
    .populate('recipientId', '_id displayName')
    .populate('sourceRequestId')
    .populate('targetRequestId')
    .exec();

  if (!proposal) {
    const err = new Error('Proposal not found.');
    err.statusCode = 404;
    err.code = 'PROPOSAL_NOT_FOUND';
    throw err;
  }

  // Authorization: only proposer or recipient can view
  const isAuthorized =
    currentUserId &&
    (proposal.proposerId._id.toString() === currentUserId.toString() ||
      proposal.recipientId._id.toString() === currentUserId.toString());

  if (!isAuthorized) {
    const err = new Error('You do not have permission to view this proposal.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  return proposal;
}

/**
 * Recipient accepts or rejects a proposal.
 * If accepted: atomically creates draft Activity and approved JoinRequest with guarded rollbacks.
 */
async function decideProposal({ proposalId, decision, currentUserId }) {
  const proposal = await Proposal.findById(proposalId).exec();
  if (!proposal) {
    const err = new Error('Proposal not found.');
    err.statusCode = 404;
    err.code = 'PROPOSAL_NOT_FOUND';
    throw err;
  }

  // Only recipient can make decision
  if (!currentUserId || proposal.recipientId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the proposal recipient can accept or reject this proposal.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Stale date check: start time must be in the future before accepting
  if (decision === 'accepted') {
    if (new Date(proposal.activityDraft.startsAt).getTime() <= Date.now()) {
      const err = new Error('Cannot accept proposal: proposed activity start time has already elapsed.');
      err.statusCode = 400;
      err.code = 'INVALID_ACTIVITY_TIME';
      throw err;
    }

    // Verify associated interest requests remain in expected 'proposed' state
    const [sourceReq, targetReq] = await Promise.all([
      InterestRequest.findById(proposal.sourceRequestId).exec(),
      InterestRequest.findById(proposal.targetRequestId).exec()
    ]);

    if (!sourceReq || !targetReq) {
      const err = new Error('Associated interest requests not found.');
      err.statusCode = 404;
      err.code = 'INTEREST_REQUEST_NOT_FOUND';
      throw err;
    }

    if (sourceReq.status !== 'proposed' || targetReq.status !== 'proposed') {
      const err = new Error('Associated interest requests are no longer in proposed state.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE_TRANSITION';
      throw err;
    }
  }

  // Atomic state transition from pending to decision on Proposal
  const updatedProposal = await Proposal.findOneAndUpdate(
    {
      _id: proposalId,
      status: 'pending'
    },
    {
      status: decision
    },
    { new: true }
  ).exec();

  if (!updatedProposal) {
    const current = await Proposal.findById(proposalId).exec();
    const err = new Error(`Proposal is no longer pending (current state: ${current ? current.status : 'unknown'}).`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // On Rejection: unlock both interest requests back to 'active'
  if (decision === 'rejected') {
    const unlockResults = await Promise.allSettled([
      InterestRequest.updateOne(
        { _id: proposal.sourceRequestId, status: 'proposed' },
        { status: 'active' }
      ).exec(),
      InterestRequest.updateOne(
        { _id: proposal.targetRequestId, status: 'proposed' },
        { status: 'active' }
      ).exec()
    ]);

    for (const [idx, reqId] of [proposal.sourceRequestId, proposal.targetRequestId].entries()) {
      if (unlockResults[idx].status === 'rejected') {
        console.error(`Warning: Failed to unlock interest request ${reqId} during rejection:`, unlockResults[idx].reason);
        try {
          await InterestRequest.updateOne({ _id: reqId, status: 'proposed' }, { status: 'active' }).exec();
        } catch (retryErr) {
          console.error(`Critical: Retry unlock failed for interest request ${reqId}:`, retryErr);
        }
      }
    }

    // Asynchronously notify proposer that recipient declined the proposal
    dispatchNotificationAsync({
      recipientId: proposal.proposerId,
      type: 'PROPOSAL_REJECTED',
      title: 'Proposal Declined',
      message: 'Your activity proposal was declined by the participant.',
      relatedResourceId: proposal._id,
      relatedResourceType: 'proposal'
    });

    return { proposal: updatedProposal };
  }

  // On Acceptance: create draft Activity and approved JoinRequest with guarded rollbacks
  if (decision === 'accepted') {
    const draft = proposal.activityDraft;

    let newActivity;
    try {
      newActivity = new Activity({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        organizerId: proposal.proposerId,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        location: draft.location,
        displayArea: draft.displayArea,
        capacity: draft.capacity || 2,
        placesFilled: 1, // confirmed recipient attendee
        budget: draft.budget || 0,
        skillLevel: draft.skillLevel || 'all-levels',
        approvalRequired: true,
        status: 'draft'
      });

      await newActivity.save();
    } catch (actErr) {
      // Compensating rollback: revert proposal to pending
      try {
        await Proposal.updateOne(
          { _id: proposalId, status: 'accepted' },
          { status: 'pending' }
        ).exec();
      } catch (rbErr) {
        console.error('Critical: Failed to rollback proposal status after activity creation error:', rbErr);
      }
      throw actErr;
    }

    let joinRequest;
    try {
      joinRequest = new JoinRequest({
        activityId: newActivity._id,
        userId: proposal.recipientId,
        status: 'approved',
        note: 'Accepted proposal matching'
      });

      await joinRequest.save();
    } catch (joinErr) {
      // Compensating rollback: delete created activity, revert proposal to pending
      try {
        await Activity.deleteOne({ _id: newActivity._id }).exec();
        await Proposal.updateOne(
          { _id: proposalId, status: 'accepted' },
          { status: 'pending' }
        ).exec();
      } catch (rbErr) {
        console.error('Critical: Failed rollback after joinRequest creation error:', rbErr);
      }
      throw joinErr;
    }

    // Convert both interest requests
    const convertResults = await Promise.allSettled([
      InterestRequest.updateOne(
        { _id: proposal.sourceRequestId, status: 'proposed' },
        { status: 'converted' }
      ).exec(),
      InterestRequest.updateOne(
        { _id: proposal.targetRequestId, status: 'proposed' },
        { status: 'converted' }
      ).exec()
    ]);

    for (const [idx, reqId] of [proposal.sourceRequestId, proposal.targetRequestId].entries()) {
      if (convertResults[idx].status === 'rejected') {
        console.error(`Warning: Failed converting interest request ${reqId} during acceptance:`, convertResults[idx].reason);
        try {
          await InterestRequest.updateOne({ _id: reqId, status: 'proposed' }, { status: 'converted' }).exec();
        } catch (retryErr) {
          console.error(`Critical: Retry convert failed for interest request ${reqId}:`, retryErr);
        }
      }
    }

    // Link resulting activity to proposal
    updatedProposal.resultingActivityId = newActivity._id;
    await updatedProposal.save();

    // Asynchronously notify proposer that recipient accepted!
    dispatchNotificationAsync({
      recipientId: proposal.proposerId,
      type: 'PROPOSAL_ACCEPTED',
      title: 'Proposal Accepted',
      message: `Your proposal was accepted! Draft activity "${newActivity.title}" is ready for review.`,
      relatedResourceId: newActivity._id,
      relatedResourceType: 'activity'
    });

    return {
      proposal: updatedProposal,
      activity: newActivity
    };
  }
}

/**
 * Proposer cancels their pending proposal.
 * Unlocks both interest requests back to 'active'.
 */
async function cancelProposal({ proposalId, currentUserId }) {
  const proposal = await Proposal.findById(proposalId).exec();
  if (!proposal) {
    const err = new Error('Proposal not found.');
    err.statusCode = 404;
    err.code = 'PROPOSAL_NOT_FOUND';
    throw err;
  }

  // Only proposer can cancel
  if (!currentUserId || proposal.proposerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the proposer can cancel this proposal.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const updatedProposal = await Proposal.findOneAndUpdate(
    {
      _id: proposalId,
      status: 'pending'
    },
    {
      status: 'cancelled'
    },
    { new: true }
  ).exec();

  if (!updatedProposal) {
    const current = await Proposal.findById(proposalId).exec();
    const err = new Error(`Proposal is no longer pending (current state: ${current ? current.status : 'unknown'}).`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // Unlock both interest requests back to active using conditional update
  const unlockResults = await Promise.allSettled([
    InterestRequest.updateOne(
      { _id: proposal.sourceRequestId, status: 'proposed' },
      { status: 'active' }
    ).exec(),
    InterestRequest.updateOne(
      { _id: proposal.targetRequestId, status: 'proposed' },
      { status: 'active' }
    ).exec()
  ]);

  for (const [idx, reqId] of [proposal.sourceRequestId, proposal.targetRequestId].entries()) {
    if (unlockResults[idx].status === 'rejected') {
      console.error(`Warning: Failed unlocking interest request ${reqId} during cancellation:`, unlockResults[idx].reason);
      try {
        await InterestRequest.updateOne({ _id: reqId, status: 'proposed' }, { status: 'active' }).exec();
      } catch (retryErr) {
        console.error(`Critical: Retry unlock failed for interest request ${reqId}:`, retryErr);
      }
    }
  }

  // Asynchronously notify recipient that proposal was cancelled
  dispatchNotificationAsync({
    recipientId: proposal.recipientId,
    type: 'PROPOSAL_CANCELLED',
    title: 'Proposal Cancelled',
    message: 'An activity proposal was cancelled by the proposer.',
    relatedResourceId: proposal._id,
    relatedResourceType: 'proposal'
  });

  return updatedProposal;
}

module.exports = {
  createProposal,
  getProposals,
  getProposalById,
  decideProposal,
  cancelProposal
};
