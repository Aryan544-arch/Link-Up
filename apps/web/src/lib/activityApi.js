import apiClient from './api.js';

/**
 * LinkUp Activity API Service
 * 
 * Implements verified REST endpoints per MEETUP_Pulse_PRD.md and Step 4-7 specifications:
 * - GET /api/activities (supported filters only: lat, lng, radiusKm, category, skillLevel, maxBudget, startDate, endDate, page, limit)
 * - GET /api/activities/:id
 * - POST /api/activities (draft creation with GeoJSON [longitude, latitude] coordinates)
 * - POST /api/activities/:id/publish (explicit publishing operation)
 * - POST /api/activities/:id/join (join request)
 * - POST /api/join-requests/:id/cancel (cancel join request)
 * - GET /api/activities/:id/requests (organizer retrieves requests)
 * - PATCH /api/join-requests/:id (organizer approves/rejects: { status: 'approved' | 'rejected' })
 * - GET /api/me/plans (My Plans integration)
 */

/**
 * Fetches discovery activities with supported filters only.
 * 
 * Rules:
 * 1. Send lat and lng together. If coordinates are unavailable, omit both.
 * 2. Use radiusKm, not radius.
 * 3. Never send keyword-search parameters (no backend text search).
 * 4. Read activity list from response.data.data.activities.
 * 5. Read pagination from response.data.data.pagination.
 */
export async function fetchActivities(filters = {}, options = {}) {
  const {
    lat = undefined,
    lng = undefined,
    radiusKm = 3,
    category = 'All',
    skillLevel = undefined,
    maxBudget = undefined,
    startDate = undefined,
    endDate = undefined,
    page = 1,
    limit = 12,
  } = filters;

  const params = {};

  // 1. Coordinates: Only send if BOTH are valid numbers
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng)
  ) {
    params.lat = lat;
    params.lng = lng;
  }

  // 2. Radius in kilometers
  if (radiusKm !== undefined && radiusKm !== null && !isNaN(Number(radiusKm))) {
    params.radiusKm = Number(radiusKm);
  }

  // 3. Category filter
  if (category && category !== 'All' && category !== 'all') {
    params.category = category;
  }

  // 4. Skill level filter
  if (skillLevel && skillLevel !== 'All' && skillLevel !== 'all' && skillLevel !== 'All skill levels welcome') {
    params.skillLevel = skillLevel;
  }

  // 5. Maximum budget filter
  if (maxBudget !== undefined && maxBudget !== null && maxBudget !== 'all' && !isNaN(Number(maxBudget))) {
    params.maxBudget = Number(maxBudget);
  }

  // 6. Date bounds
  if (startDate) {
    params.startDate = startDate;
  }
  if (endDate) {
    params.endDate = endDate;
  }

  // 7. Pagination
  if (page) params.page = Number(page);
  if (limit) params.limit = Number(limit);

  const response = await apiClient.get('/api/activities', {
    params,
    signal: options.signal,
  });

  const rawData = response.data;

  // Extract activities array from standard envelope response.data.data.activities
  let activities = null;
  let rawPagination = null;

  if (rawData && typeof rawData === 'object') {
    if (rawData.data && typeof rawData.data === 'object') {
      if (Array.isArray(rawData.data.activities)) {
        activities = rawData.data.activities;
      } else if (Array.isArray(rawData.data)) {
        activities = rawData.data;
      }
      rawPagination = rawData.data.pagination;
    } else if (Array.isArray(rawData.activities)) {
      activities = rawData.activities;
      rawPagination = rawData.pagination;
    } else if (Array.isArray(rawData)) {
      activities = rawData;
    }
  }

  if (!Array.isArray(activities)) {
    const malformedErr = new Error('Received malformed response format from activities endpoint.');
    malformedErr.normalized = {
      status: response.status || 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The server returned an unexpected response format while fetching activities.',
      isNetworkError: false,
    };
    throw malformedErr;
  }

  const currentPage = Number(rawPagination?.page) || Number(page) || 1;
  const currentLimit = Number(rawPagination?.limit) || Number(limit) || 12;
  const total = typeof rawPagination?.total === 'number'
    ? rawPagination.total
    : activities.length;
  const totalPages = typeof rawPagination?.totalPages === 'number'
    ? rawPagination.totalPages
    : Math.ceil(total / currentLimit);

  const hasMore = typeof rawPagination?.hasMore === 'boolean'
    ? rawPagination.hasMore
    : typeof rawPagination?.hasNextPage === 'boolean'
    ? rawPagination.hasNextPage
    : (currentPage * currentLimit < total);

  const pagination = {
    page: currentPage,
    limit: currentLimit,
    total,
    totalPages,
    hasMore,
  };

  return {
    activities,
    pagination,
  };
}

/**
 * Fetches single activity details by ID.
 * Implements GET /api/activities/:id.
 */
export async function fetchActivityById(id, options = {}) {
  if (!id) {
    throw new Error('Activity ID is required to fetch activity details.');
  }

  const response = await apiClient.get(`/api/activities/${encodeURIComponent(id)}`, {
    signal: options.signal,
  });

  const rawData = response.data;
  const activity = rawData?.data?.activity || rawData?.data || rawData?.activity || rawData;

  const hasIdentifierOrTitle = activity && typeof activity === 'object' && (activity.id || activity._id || activity.title);
  if (!activity || typeof activity !== 'object' || Array.isArray(activity) || !hasIdentifierOrTitle) {
    const malformedErr = new Error('Received malformed activity details from server.');
    malformedErr.normalized = {
      status: response.status || 200,
      code: 'MALFORMED_RESPONSE',
      message: 'The server returned an unexpected format for activity details.',
      isNetworkError: false,
    };
    throw malformedErr;
  }

  return activity;
}

/**
 * Creates a new draft activity.
 * Implements POST /api/activities per Step 6.
 * 
 * Rules:
 * - Coordinates must be in [longitude, latitude] GeoJSON order.
 * - Server-managed fields (organizerId, status, placesFilled) must NOT be passed.
 * - Successful creation produces a draft, not a published activity.
 */
export async function createActivity(activityData, options = {}) {
  if (!activityData || typeof activityData !== 'object') {
    throw new Error('Activity data object is required to create an activity.');
  }

  const response = await apiClient.post('/api/activities', activityData, {
    signal: options.signal,
  });

  const rawData = response.data;
  const createdActivity = rawData?.data?.activity || rawData?.data || rawData?.activity || rawData;

  if (!createdActivity || typeof createdActivity !== 'object') {
    const malformedErr = new Error('Received unexpected response format after creating activity draft.');
    malformedErr.normalized = {
      status: response.status || 201,
      code: 'MALFORMED_RESPONSE',
      message: 'The server created the draft activity but returned an unexpected response format.',
      isNetworkError: false,
    };
    throw malformedErr;
  }

  return createdActivity;
}

/**
 * Publishes an existing draft activity.
 * Implements POST /api/activities/:id/publish per Step 6.
 */
export async function publishActivity(id, options = {}) {
  if (!id) {
    throw new Error('Activity ID is required to publish an activity.');
  }

  const response = await apiClient.post(`/api/activities/${encodeURIComponent(id)}/publish`, {}, {
    signal: options.signal,
  });

  const rawData = response.data;
  const publishedActivity = rawData?.data?.activity || rawData?.data || rawData?.activity || rawData;

  return publishedActivity;
}

/**
 * Submits request to join an activity.
 * Implements POST /api/activities/:id/join per Step 7.
 * 
 * Body: { note?: string }
 */
export async function requestToJoinActivity(id, payload = {}, options = {}) {
  if (!id) {
    throw new Error('Activity ID is required to request to join.');
  }

  const body = {};
  if (payload.note && typeof payload.note === 'string' && payload.note.trim()) {
    body.note = payload.note.trim();
  }

  const response = await apiClient.post(`/api/activities/${encodeURIComponent(id)}/join`, body, {
    signal: options.signal,
  });

  return response.data?.data || response.data;
}

/**
 * Cancels a join request.
 * Implements POST /api/join-requests/:id/cancel per Step 7.
 * Note: Never use DELETE.
 */
export async function cancelJoinRequest(requestId, options = {}) {
  if (!requestId) {
    throw new Error('Join request ID is required to cancel.');
  }

  const response = await apiClient.post(`/api/join-requests/${encodeURIComponent(requestId)}/cancel`, {}, {
    signal: options.signal,
  });

  return response.data?.data || response.data;
}

/**
 * Organizer retrieves join requests for an activity.
 * Implements GET /api/activities/:id/requests per Step 7.
 */
export async function fetchActivityRequests(activityId, options = {}) {
  if (!activityId) {
    throw new Error('Activity ID is required to fetch requests.');
  }

  const response = await apiClient.get(`/api/activities/${encodeURIComponent(activityId)}/requests`, {
    signal: options.signal,
  });

  const rawData = response.data;
  const requests = rawData?.data?.requests || rawData?.data || rawData?.requests || [];

  return Array.isArray(requests) ? requests : [];
}

/**
 * Organizer decides (approves or rejects) a join request.
 * Implements PATCH /api/join-requests/:id per Step 7.
 * 
 * @param {string} requestId 
 * @param {'approved' | 'rejected'} status 
 */
export async function decideJoinRequest(requestId, status, options = {}) {
  if (!requestId) {
    throw new Error('Join request ID is required to update status.');
  }

  if (status !== 'approved' && status !== 'rejected') {
    throw new Error('Decision status must be either "approved" or "rejected".');
  }

  const response = await apiClient.patch(`/api/join-requests/${encodeURIComponent(requestId)}`, { status }, {
    signal: options.signal,
  });

  return response.data?.data || response.data;
}

/**
 * Fetches user plans and organized activities.
 * Implements GET /api/me/plans per PRD §11 FR-13 & Step 8.
 */
export async function fetchMyPlans(options = {}) {
  const response = await apiClient.get('/api/me/plans', {
    signal: options.signal,
  });

  return response.data?.data || response.data;
}

/**
 * Recipient accepts or rejects a proposed plan.
 * Implements PATCH /api/proposals/:id per Phase 7 backend contract.
 *
 * @param {string} proposalId
 * @param {'accepted' | 'rejected'} decision
 */
export async function decideProposal(proposalId, decision, options = {}) {
  if (!proposalId) {
    throw new Error('Proposal ID is required to make a decision.');
  }

  if (decision !== 'accepted' && decision !== 'rejected') {
    throw new Error("Decision must be either 'accepted' or 'rejected'.");
  }

  const response = await apiClient.patch(
    `/api/proposals/${encodeURIComponent(proposalId)}`,
    { decision },
    { signal: options.signal }
  );

  return response.data?.data || response.data;
}

/**
 * Proposer cancels their pending proposal.
 * Implements POST /api/proposals/:id/cancel per Phase 7 backend contract.
 *
 * @param {string} proposalId
 */
export async function cancelProposal(proposalId, options = {}) {
  if (!proposalId) {
    throw new Error('Proposal ID is required to cancel.');
  }

  const response = await apiClient.post(
    `/api/proposals/${encodeURIComponent(proposalId)}/cancel`,
    {},
    { signal: options.signal }
  );

  return response.data?.data || response.data;
}

/**
 * Organizer cancels their organized activity.
 * Implements POST /api/activities/:id/cancel per PRD §5 FR-05.
 *
 * @param {string} activityId
 */
export async function cancelActivity(activityId, options = {}) {
  if (!activityId) {
    throw new Error('Activity ID is required to cancel.');
  }

  const response = await apiClient.post(
    `/api/activities/${encodeURIComponent(activityId)}/cancel`,
    {},
    { signal: options.signal }
  );

  return response.data?.data || response.data;
}

/**
 * Reporting is unavailable in the demo per Step 5.
 * This function will NOT call POST /api/reports.
 */
export async function reportActivity() {
  throw new Error('Reporting is unavailable in this demo');
}

