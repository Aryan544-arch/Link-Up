const InterestRequest = require('../models/InterestRequest');

/**
 * Privacy-safe serializer for InterestRequest objects.
 * Owner sees full coordinates; other users receive null coordinates.
 */
function serializeInterestRequest(interestRequest, currentUserId = null) {
  const doc = interestRequest.toObject ? interestRequest.toObject() : { ...interestRequest };
  const isOwner = Boolean(
    currentUserId &&
      doc.userId &&
      (doc.userId._id ? doc.userId._id.toString() : doc.userId.toString()) === currentUserId.toString()
  );

  if (!isOwner) {
    return {
      ...doc,
      location: {
        type: doc.location?.type || 'Point',
        coordinates: null,
        isPrecise: false
      }
    };
  }

  return {
    ...doc,
    location: {
      ...doc.location,
      isPrecise: true
    }
  };
}

/**
 * Creates an interest request with active status.
 * Rejects duplicate active requests per user/category at database level.
 */
async function createInterestRequest({ payload, userId }) {
  if (!userId) {
    const err = new Error('User identity is required to create an interest request.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // Check that timeEnd is in the future
  if (new Date(payload.timeEnd).getTime() <= Date.now()) {
    const err = new Error('End time must be in the future.');
    err.statusCode = 400;
    err.code = 'INVALID_DATES';
    throw err;
  }

  const interestRequest = new InterestRequest({
    ...payload,
    userId,
    status: 'active'
  });

  try {
    await interestRequest.save();
  } catch (err) {
    if (err.code === 11000) {
      const dupErr = new Error('You already have an active interest request for this category.');
      dupErr.statusCode = 409;
      dupErr.code = 'DUPLICATE_INTEREST_REQUEST';
      throw dupErr;
    }
    throw err;
  }

  return serializeInterestRequest(interestRequest, userId);
}

/**
 * Lists interest requests created by the authenticated user.
 */
async function getInterestRequests({ userId, query = {} }) {
  if (!userId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const filter = { userId };
  if (query.status) {
    filter.status = query.status;
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    InterestRequest.find(filter)
      .sort({ createdAt: -1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    InterestRequest.countDocuments(filter).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    requests: requests.map((r) => serializeInterestRequest(r, userId)),
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
 * Retrieves a single interest request by ID.
 */
async function getInterestRequestById({ requestId, currentUserId }) {
  const request = await InterestRequest.findById(requestId)
    .populate('userId', '_id displayName')
    .exec();

  if (!request) {
    const err = new Error('Interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  return serializeInterestRequest(request, currentUserId);
}

/**
 * Updates permitted fields on an active interest request with ownership check.
 */
async function updateInterestRequest({ requestId, payload, currentUserId }) {
  const request = await InterestRequest.findById(requestId).exec();
  if (!request) {
    const err = new Error('Interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  if (!currentUserId || request.userId.toString() !== currentUserId.toString()) {
    const err = new Error('You do not have permission to update this interest request.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (request.status !== 'active') {
    const err = new Error(`Cannot update request in ${request.status} status.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  Object.assign(request, payload);
  await request.save();

  return serializeInterestRequest(request, currentUserId);
}

/**
 * Cancels / withdraws an active interest request.
 * Allows immediate re-creation of request in same category.
 */
async function cancelInterestRequest({ requestId, currentUserId }) {
  const request = await InterestRequest.findById(requestId).exec();
  if (!request) {
    const err = new Error('Interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  if (!currentUserId || request.userId.toString() !== currentUserId.toString()) {
    const err = new Error('You do not have permission to cancel this interest request.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  const updatedRequest = await InterestRequest.findOneAndUpdate(
    { _id: requestId, status: 'active' },
    { status: 'withdrawn' },
    { new: true }
  ).exec();

  if (!updatedRequest) {
    const current = await InterestRequest.findById(requestId).exec();
    const err = new Error(`Cannot cancel request in ${current ? current.status : 'unknown'} status.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  return serializeInterestRequest(updatedRequest, currentUserId);
}

module.exports = {
  createInterestRequest,
  getInterestRequests,
  getInterestRequestById,
  updateInterestRequest,
  cancelInterestRequest,
  serializeInterestRequest
};
