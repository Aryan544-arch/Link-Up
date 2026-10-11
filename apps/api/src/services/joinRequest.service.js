const mongoose = require('mongoose');
const JoinRequest = require('../models/JoinRequest');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { createNotification, dispatchNotificationAsync } = require('./notification.service');

/**
 * Creates a join request for a published activity.
 *
 * Enforces:
 * - Activity exists, is published, and is in the future.
 * - Requester is not the activity organizer.
 * - No duplicate active requests (database index + application check).
 * - Instant join if approvalRequired === false with atomic capacity increment.
 */
async function requestToJoin({ activityId, userId, note = null }) {
  if (!userId) {
    const err = new Error('Authentication required to join an activity.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const activity = await Activity.findById(activityId).exec();
  if (!activity) {
    const err = new Error('Activity not found.');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Organizers cannot join their own activity
  if (activity.organizerId && activity.organizerId.toString() === userId.toString()) {
    const err = new Error('Organizers cannot request to join their own activity.');
    err.statusCode = 400;
    err.code = 'ORGANIZER_CANNOT_JOIN';
    throw err;
  }

  // Must be in published state
  if (activity.status !== 'published') {
    const err = new Error(`Cannot join an activity that is ${activity.status}.`);
    err.statusCode = 400;
    err.code = 'ACTIVITY_NOT_PUBLISHED';
    throw err;
  }

  // Cannot join past or already started activities
  if (new Date(activity.startsAt).getTime() <= Date.now()) {
    const err = new Error('Cannot join an activity that has already started or ended.');
    err.statusCode = 400;
    err.code = 'ACTIVITY_ALREADY_STARTED';
    throw err;
  }

  // Check capacity limit
  if (activity.placesFilled >= activity.capacity) {
    const err = new Error('This activity has reached full capacity.');
    err.statusCode = 409;
    err.code = 'ACTIVITY_FULL';
    throw err;
  }

  // Check for duplicate active request
  const existingActive = await JoinRequest.findOne({
    activityId,
    userId,
    status: { $in: ['pending', 'approved'] }
  }).exec();

  if (existingActive) {
    const err = new Error('You already have an active request to join this activity.');
    err.statusCode = 409;
    err.code = 'DUPLICATE_JOIN_REQUEST';
    throw err;
  }

  // Look up applicant name for notifications if DB is connected
  let applicantName = 'A participant';
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const applicant = await User.findById(userId).select('displayName').lean().exec();
      if (applicant && applicant.displayName) {
        applicantName = applicant.displayName;
      }
    } catch (_) {
      // In mock test environments or db read failure, fallback gracefully
    }
  }

  // Case 1: Instant Join (approvalRequired === false)
  if (!activity.approvalRequired) {
    // Atomic capacity increment
    const updatedActivity = await Activity.findOneAndUpdate(
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

    if (!updatedActivity) {
      const err = new Error('This activity has reached full capacity.');
      err.statusCode = 409;
      err.code = 'ACTIVITY_FULL';
      throw err;
    }

    try {
      const joinRequest = new JoinRequest({
        activityId,
        userId,
        status: 'approved',
        note
      });
      await joinRequest.save();

      // Create in-app notification for the organizer
      try {
        await createNotification({
          recipientId: activity.organizerId,
          type: 'JOIN_REQUEST_RECEIVED',
          title: 'New Participant Joined',
          message: `${applicantName} joined "${activity.title}".`,
          relatedResourceId: activity._id,
          relatedResourceType: 'activity',
          metadata: { requestId: joinRequest._id, applicantId: userId, applicantName }
        });
      } catch (notifErr) {
        dispatchNotificationAsync({
          recipientId: activity.organizerId,
          type: 'JOIN_REQUEST_RECEIVED',
          title: 'New Participant Joined',
          message: `${applicantName} joined "${activity.title}".`,
          relatedResourceId: activity._id,
          relatedResourceType: 'activity',
          metadata: { requestId: joinRequest._id, applicantId: userId, applicantName }
        });
      }

      return joinRequest;
    } catch (dbErr) {
      // Rollback atomic capacity increment on error (e.g. duplicate key race)
      await Activity.updateOne(
        { _id: activityId },
        { $inc: { placesFilled: -1 } }
      ).exec();

      if (dbErr.code === 11000) {
        const err = new Error('You already have an active request to join this activity.');
        err.statusCode = 409;
        err.code = 'DUPLICATE_JOIN_REQUEST';
        throw err;
      }
      throw dbErr;
    }
  }

  // Case 2: Approval Required (approvalRequired === true)
  try {
    const joinRequest = new JoinRequest({
      activityId,
      userId,
      status: 'pending',
      note
    });
    await joinRequest.save();

    // Create in-app notification for the organizer
    try {
      await createNotification({
        recipientId: activity.organizerId,
        type: 'JOIN_REQUEST_RECEIVED',
        title: 'New Join Request',
        message: `${applicantName} requested to join "${activity.title}".`,
        relatedResourceId: activity._id,
        relatedResourceType: 'activity',
        metadata: { requestId: joinRequest._id, applicantId: userId, applicantName }
      });
    } catch (notifErr) {
      dispatchNotificationAsync({
        recipientId: activity.organizerId,
        type: 'JOIN_REQUEST_RECEIVED',
        title: 'New Join Request',
        message: `${applicantName} requested to join "${activity.title}".`,
        relatedResourceId: activity._id,
        relatedResourceType: 'activity',
        metadata: { requestId: joinRequest._id, applicantId: userId, applicantName }
      });
    }

    return joinRequest;
  } catch (dbErr) {
    if (dbErr.code === 11000) {
      const err = new Error('You already have an active request to join this activity.');
      err.statusCode = 409;
      err.code = 'DUPLICATE_JOIN_REQUEST';
      throw err;
    }
    throw dbErr;
  }
}

/**
 * Retrieves join requests for an activity (Organizer Only).
 */
async function getActivityJoinRequests({ activityId, currentUserId, query = {} }) {
  const activity = await Activity.findById(activityId).exec();
  if (!activity) {
    const err = new Error('Activity not found.');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Enforce organizer ownership
  if (!currentUserId || activity.organizerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the activity organizer can view its join requests.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const filter = { activityId };
  if (query.status) {
    filter.status = query.status;
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    JoinRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', '_id displayName') // Privacy: only public fields populated
      .exec(),
    JoinRequest.countDocuments(filter).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    requests,
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
 * Organizer approves or rejects a pending join request with atomic capacity protection.
 */
async function decideJoinRequest({ requestId, decision, currentUserId }) {
  const joinRequest = await JoinRequest.findById(requestId).exec();
  if (!joinRequest) {
    const err = new Error('Join request not found.');
    err.statusCode = 404;
    err.code = 'JOIN_REQUEST_NOT_FOUND';
    throw err;
  }

  const activity = await Activity.findById(joinRequest.activityId).exec();
  if (!activity) {
    const err = new Error('Associated activity not found.');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Enforce organizer ownership
  if (!currentUserId || activity.organizerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the activity organizer can make decisions on join requests.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Prevent self-approval
  if (joinRequest.userId.toString() === currentUserId.toString()) {
    const err = new Error('Organizers cannot approve their own join requests.');
    err.statusCode = 400;
    err.code = 'SELF_APPROVAL_FORBIDDEN';
    throw err;
  }

  // State check: must be pending
  if (joinRequest.status !== 'pending') {
    const err = new Error(`Request has already been ${joinRequest.status}.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  if (decision === 'rejected') {
    joinRequest.status = 'rejected';
    await joinRequest.save();

    // Asynchronously notify applicant of rejection
    dispatchNotificationAsync({
      recipientId: joinRequest.userId,
      type: 'JOIN_REQUEST_REJECTED',
      title: 'Join Request Declined',
      message: `Your request to join "${activity.title}" was declined.`,
      relatedResourceId: activity._id,
      relatedResourceType: 'activity'
    });

    return joinRequest;
  }

  if (decision === 'approved') {
    // ATOMIC CAPACITY SAFETY:
    // Atomic conditional increment strictly ensures placesFilled < capacity at execution time.
    const updatedActivity = await Activity.findOneAndUpdate(
      {
        _id: activity._id,
        status: 'published',
        $expr: { $lt: ['$placesFilled', '$capacity'] }
      },
      {
        $inc: { placesFilled: 1 }
      },
      { new: true }
    ).exec();

    if (!updatedActivity) {
      const err = new Error('Cannot approve request: activity has reached capacity.');
      err.statusCode = 409;
      err.code = 'ACTIVITY_FULL';
      throw err;
    }

    let updatedRequest;
    try {
      // Atomically transition request status from pending to approved
      updatedRequest = await JoinRequest.findOneAndUpdate(
        {
          _id: joinRequest._id,
          status: 'pending'
        },
        {
          status: 'approved'
        },
        { new: true }
      ).exec();
    } catch (dbErr) {
      // If JoinRequest update threw an error, compensate by decrementing placesFilled
      try {
        await Activity.updateOne(
          { _id: activity._id },
          { $inc: { placesFilled: -1 } }
        ).exec();
      } catch (rollbackErr) {
        console.error('Failed compensating decrement for activity:', activity._id, rollbackErr);
      }
      throw dbErr;
    }

    // If request was concurrently cancelled or modified, rollback capacity increment
    if (!updatedRequest) {
      await Activity.updateOne(
        { _id: activity._id },
        { $inc: { placesFilled: -1 } }
      ).exec();

      const err = new Error('Request is no longer pending.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE_TRANSITION';
      throw err;
    }

    // Asynchronously notify applicant of approval
    dispatchNotificationAsync({
      recipientId: joinRequest.userId,
      type: 'JOIN_REQUEST_APPROVED',
      title: 'Join Request Approved',
      message: `Your request to join "${activity.title}" was approved!`,
      relatedResourceId: activity._id,
      relatedResourceType: 'activity'
    });

    return updatedRequest;
  }
}

/**
 * Cancels a user's own join request (withdrawal of request or leaving activity).
 * Atomic status transition prevents double-decrement race conditions.
 */
async function cancelJoinRequest({ requestId, currentUserId, reason = null }) {
  const joinRequest = await JoinRequest.findById(requestId).exec();
  if (!joinRequest) {
    const err = new Error('Join request not found.');
    err.statusCode = 404;
    err.code = 'JOIN_REQUEST_NOT_FOUND';
    throw err;
  }

  // Only the applicant can cancel their own join request
  if (!currentUserId || joinRequest.userId.toString() !== currentUserId.toString()) {
    const err = new Error('You can only cancel your own join request.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Atomic transition from pending or approved to cancelled
  const updatedRequest = await JoinRequest.findOneAndUpdate(
    {
      _id: requestId,
      status: { $in: ['pending', 'approved'] }
    },
    {
      status: 'cancelled'
    },
    { new: false } // Returns document state BEFORE update to know prior status
  ).exec();

  if (!updatedRequest) {
    // If transition failed, check current state for informative error
    const current = await JoinRequest.findById(requestId).exec();
    if (current && current.status === 'cancelled') {
      const err = new Error('Join request is already cancelled.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE_TRANSITION';
      throw err;
    }

    if (current && current.status === 'rejected') {
      const err = new Error('Cannot cancel a rejected request.');
      err.statusCode = 400;
      err.code = 'INVALID_STATE_TRANSITION';
      throw err;
    }

    const err = new Error('Cannot cancel request in current state.');
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // If request was previously approved, free up the place atomically
  if (updatedRequest.status === 'approved') {
    await Activity.updateOne(
      { _id: updatedRequest.activityId },
      { $inc: { placesFilled: -1 } }
    ).exec();

    // Asynchronously notify organizer: confirmed participant cancelled attendance
    if (Activity.db.readyState === 1) {
      Activity.findById(updatedRequest.activityId).exec().then((act) => {
        if (act) {
          dispatchNotificationAsync({
            recipientId: act.organizerId,
            type: 'ATTENDEE_CANCELLED',
            title: 'Participant Cancelled Attendance',
            message: `A participant cancelled their attendance for "${act.title}".`,
            relatedResourceId: act._id,
            relatedResourceType: 'activity'
          });
        }
      }).catch((err) => {
        console.error('[Notification] Error fetching activity for cancellation notification:', err.message);
      });
    }
  }

  return {
    ...(updatedRequest.toObject ? updatedRequest.toObject() : updatedRequest),
    status: 'cancelled'
  };
}

module.exports = {
  requestToJoin,
  getActivityJoinRequests,
  decideJoinRequest,
  cancelJoinRequest
};
