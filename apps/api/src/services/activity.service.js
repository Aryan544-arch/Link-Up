const Activity = require('../models/Activity');
const JoinRequest = require('../models/JoinRequest');
const { DEFAULT_RADIUS_KM } = require('../constants/activity.constants');
const { dispatchNotificationAsync } = require('./notification.service');

const EARTH_RADIUS_KM = 6378.1;

/**
 * Privacy-safe serializer for Activity objects.
 *
 * Privacy Rules (PRD §5, §10):
 * - If user is organizer: full details including exact location coordinates.
 * - If user is unauthorized/public: displayArea is provided, but exact
 *   meeting coordinates are withheld (coordinates: null, isPrecise: false).
 */
function serializeActivity(activity, currentUserId = null) {
  const doc = activity.toObject ? activity.toObject() : { ...activity };
  const isOrganizer = Boolean(
    currentUserId &&
      doc.organizerId &&
      doc.organizerId.toString() === currentUserId.toString()
  );

  if (!isOrganizer) {
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
 * Creates an activity in draft status.
 * Organizer ID is derived exclusively from the authenticated session.
 */
async function createActivity({ payload, organizerId }) {
  if (!organizerId) {
    const err = new Error('Organizer identity is required to create an activity.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const activity = new Activity({
    ...payload,
    organizerId,
    status: 'draft',
    placesFilled: 0
  });

  await activity.save();
  return serializeActivity(activity, organizerId);
}

/**
 * Discovers published, upcoming activities within radius and filters.
 */
async function findActivities({ query, currentUserId = null }) {
  const filter = {
    status: 'published',
    startsAt: { $gte: new Date() }
  };

  // Exclude activities from organizers blocked by the current user
  if (currentUserId && Activity.db.readyState === 1) {
    const { getBlockedUserIds } = require('./safety.service');
    const blockedUserIds = await getBlockedUserIds(currentUserId);
    if (blockedUserIds && blockedUserIds.length > 0) {
      filter.organizerId = { $nin: blockedUserIds };
    }
  }

  const searchMeta = {
    locationApplied: false,
    radiusKm: query.radiusKm || DEFAULT_RADIUS_KM,
    center: null
  };

  // Location search validation and filtering
  const hasLat = query.lat !== undefined;
  const hasLng = query.lng !== undefined;

  if (hasLat && hasLng) {
    const radiusKm = query.radiusKm || DEFAULT_RADIUS_KM;
    const radiusRadians = radiusKm / EARTH_RADIUS_KM;

    filter.location = {
      $geoWithin: {
        $centerSphere: [[query.lng, query.lat], radiusRadians]
      }
    };

    searchMeta.locationApplied = true;
    searchMeta.radiusKm = radiusKm;
    searchMeta.center = [query.lng, query.lat];
  } else if (query.radiusKm !== undefined && query.radiusKm !== DEFAULT_RADIUS_KM) {
    // If client explicitly requested a radius without specifying coordinates
    const err = new Error('Coordinates (lat, lng) are required when specifying a search radius.');
    err.statusCode = 400;
    err.code = 'COORDINATES_REQUIRED';
    throw err;
  }

  // Optional category filter
  if (query.category) {
    filter.category = query.category;
  }

  // Optional skill level filter
  if (query.skillLevel) {
    filter.skillLevel = query.skillLevel;
  }

  // Optional budget filter
  if (query.maxBudget !== undefined) {
    filter.budget = { $lte: query.maxBudget };
  }

  // Optional date window filter
  if (query.startDate || query.endDate) {
    const dateRange = {};
    if (query.startDate) {
      dateRange.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateRange.$lte = new Date(query.endDate);
    }
    // Intersect with existing startsAt: { $gte: now }
    filter.startsAt = {
      ...filter.startsAt,
      ...dateRange
    };
  }

  // Pagination parameters
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const [activities, total] = await Promise.all([
    Activity.find(filter)
      .sort({ startsAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Activity.countDocuments(filter).exec()
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    activities: activities.map((act) => serializeActivity(act, currentUserId)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    search: searchMeta
  };
}

/**
 * Retrieves a single activity by ID with privacy-safe serialization.
 */
async function getActivityById(activityId, currentUserId = null) {
  const activity = await Activity.findById(activityId).exec();

  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  return serializeActivity(activity, currentUserId);
}

/**
 * Updates permitted fields on an existing activity with organizer ownership verification.
 */
async function updateActivity({ activityId, updateData, currentUserId }) {
  const activity = await Activity.findById(activityId).exec();

  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Enforce organizer ownership
  if (!currentUserId || activity.organizerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the activity organizer can edit this activity.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Lifecycle check: cannot edit cancelled or completed activity
  if (activity.status === 'cancelled' || activity.status === 'completed') {
    const err = new Error(`Cannot edit an activity that is ${activity.status}.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // Apply updates (protected fields are filtered out by Zod schema)
  Object.assign(activity, updateData);

  await activity.save();
  return serializeActivity(activity, currentUserId);
}

/**
 * Explicit state transition from draft to published.
 */
async function publishActivity({ activityId, currentUserId }) {
  const activity = await Activity.findById(activityId).exec();

  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Enforce organizer ownership
  if (!currentUserId || activity.organizerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the activity organizer can publish this activity.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Explicit draft-to-published transition only
  if (activity.status !== 'draft') {
    const err = new Error(`Only draft activities can be published. Current status is ${activity.status}.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  // Cannot publish an activity whose start time is in the past
  if (new Date(activity.startsAt).getTime() <= Date.now()) {
    const err = new Error('Cannot publish an activity with a start time in the past.');
    err.statusCode = 400;
    err.code = 'INVALID_ACTIVITY_TIME';
    throw err;
  }

  activity.status = 'published';
  await activity.save();

  return serializeActivity(activity, currentUserId);
}

/**
 * Cancels an activity with organizer ownership verification.
 */
async function cancelActivity({ activityId, currentUserId, reason = null }) {
  const activity = await Activity.findById(activityId).exec();

  if (!activity) {
    const err = new Error('Activity not found');
    err.statusCode = 404;
    err.code = 'ACTIVITY_NOT_FOUND';
    throw err;
  }

  // Enforce organizer ownership
  if (!currentUserId || activity.organizerId.toString() !== currentUserId.toString()) {
    const err = new Error('Only the activity organizer can cancel this activity.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Cannot cancel already cancelled or completed activity
  if (activity.status === 'cancelled') {
    const err = new Error('Activity is already cancelled.');
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  if (activity.status === 'completed') {
    const err = new Error('Cannot cancel an activity that has already completed.');
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  activity.status = 'cancelled';
  await activity.save();

  // Asynchronously notify all approved attendees of activity cancellation
  if (Activity.db.readyState === 1) {
    JoinRequest.find({ activityId, status: 'approved' }).exec().then((attendees) => {
      if (attendees && attendees.length > 0) {
        attendees.forEach((att) => {
          dispatchNotificationAsync({
            recipientId: att.userId,
            type: 'ACTIVITY_CANCELLED',
            title: 'Activity Cancelled',
            message: `"${activity.title}" has been cancelled by the organizer.`,
            relatedResourceId: activity._id,
            relatedResourceType: 'activity'
          });
        });
      }
    }).catch((err) => {
      console.error('[Notification] Error fetching attendees for activity cancellation:', err.message);
    });
  }

  return serializeActivity(activity, currentUserId);
}

module.exports = {
  createActivity,
  findActivities,
  getActivityById,
  updateActivity,
  publishActivity,
  cancelActivity,
  serializeActivity
};
