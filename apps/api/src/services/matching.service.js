const InterestRequest = require('../models/InterestRequest');
const { serializeInterestRequest } = require('./interestRequest.service');

const EARTH_RADIUS_KM = 6378.1;

/**
 * Calculates great-circle distance between two [lng, lat] points using Haversine formula.
 */
function calculateDistanceKm([lng1, lat1], [lng2, lat2]) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Deterministic scoring function for matched interest requests.
 * Returns score (0..100), overlapHours, distanceKm, and factual match reasons.
 */
function evaluateMatch(source, target) {
  const sourceStart = new Date(source.timeStart).getTime();
  const sourceEnd = new Date(source.timeEnd).getTime();
  const targetStart = new Date(target.timeStart).getTime();
  const targetEnd = new Date(target.timeEnd).getTime();

  // Overlap window
  const overlapStart = Math.max(sourceStart, targetStart);
  const overlapEnd = Math.min(sourceEnd, targetEnd);
  const overlapMs = overlapEnd - overlapStart;
  const overlapHours = Math.max(0, overlapMs / 3600000);

  // Distance
  const distanceKm = calculateDistanceKm(
    source.location.coordinates,
    target.location.coordinates
  );

  const maxAllowedKm = (source.radiusKm || 3) + (target.radiusKm || 3);

  // 1. Category Score (40 pts max)
  const categoryScore = 40;

  // 2. Time Overlap Score (30 pts max, 4+ hours = full score)
  const timeScore = Math.min(30, Math.round((overlapHours / 4) * 30));

  // 3. Distance Score (20 pts max, closer = higher)
  const distanceScore = Math.max(
    0,
    Math.round(20 * (1 - distanceKm / maxAllowedKm))
  );

  // 4. Skill Compatibility (10 pts max)
  const isSkillCompatible =
    source.skillLevel === target.skillLevel ||
    source.skillLevel === 'all-levels' ||
    target.skillLevel === 'all-levels';
  const skillScore = isSkillCompatible ? 10 : 0;

  const totalScore = categoryScore + timeScore + distanceScore + skillScore;

  // Factual match reasons
  const matchReasons = [
    `Exact category match: ${source.category}`,
    `Overlapping time window: ${overlapHours.toFixed(1)} hours`,
    `Within ${distanceKm.toFixed(1)} km distance`,
    `Compatible skill level: ${target.skillLevel}`
  ];

  return {
    score: totalScore,
    overlapHours,
    distanceKm,
    matchReasons
  };
}

/**
 * Finds eligible deterministic matches for a specific interest request.
 */
async function findMatchesForRequest({ requestId, currentUserId }) {
  const sourceRequest = await InterestRequest.findById(requestId).exec();
  if (!sourceRequest) {
    const err = new Error('Interest request not found.');
    err.statusCode = 404;
    err.code = 'INTEREST_REQUEST_NOT_FOUND';
    throw err;
  }

  if (!currentUserId || sourceRequest.userId.toString() !== currentUserId.toString()) {
    const err = new Error('You do not have permission to view matches for this request.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (sourceRequest.status !== 'active') {
    const err = new Error(`Request is ${sourceRequest.status}; only active requests can find matches.`);
    err.statusCode = 400;
    err.code = 'INVALID_STATE_TRANSITION';
    throw err;
  }

  const now = new Date();

  // Query candidate requests satisfying hard database filters
  const candidateFilter = {
    _id: { $ne: sourceRequest._id },
    userId: { $ne: sourceRequest.userId },
    category: sourceRequest.category,
    status: 'active',
    timeEnd: { $gt: now },
    timeStart: { $lt: sourceRequest.timeEnd } // Potential time overlap
  };

  const candidates = await InterestRequest.find(candidateFilter)
    .populate('userId', '_id displayName')
    .exec();

  const maxAllowedKm = (sourceRequest.radiusKm || 3) + 100; // Upper bound filter
  const eligibleMatches = [];

  for (const candidate of candidates) {
    // 1. Strict time overlap check: overlapStart < overlapEnd
    const sourceStart = new Date(sourceRequest.timeStart).getTime();
    const sourceEnd = new Date(sourceRequest.timeEnd).getTime();
    const candStart = new Date(candidate.timeStart).getTime();
    const candEnd = new Date(candidate.timeEnd).getTime();

    if (Math.max(sourceStart, candStart) >= Math.min(sourceEnd, candEnd)) {
      continue;
    }

    // 2. Strict distance radius check
    const distanceKm = calculateDistanceKm(
      sourceRequest.location.coordinates,
      candidate.location.coordinates
    );

    const pairMaxRadius = (sourceRequest.radiusKm || 3) + (candidate.radiusKm || 3);
    if (distanceKm > pairMaxRadius) {
      continue;
    }

    // Calculate deterministic score & match reasons
    const evaluation = evaluateMatch(sourceRequest, candidate);

    // Privacy-safe serialized target
    const serializedTarget = serializeInterestRequest(candidate, currentUserId);
    serializedTarget.approximateDistanceMeters = Math.round(distanceKm * 1000);

    eligibleMatches.push({
      targetRequest: serializedTarget,
      score: evaluation.score,
      overlapHours: evaluation.overlapHours,
      distanceKm: evaluation.distanceKm,
      matchReasons: evaluation.matchReasons,
      createdAt: candidate.createdAt,
      _id: candidate._id
    });
  }

  // Strict deterministic tie-breaking sort:
  // 1. score DESC
  // 2. overlapHours DESC
  // 3. distanceKm ASC
  // 4. createdAt ASC
  // 5. _id ASC
  eligibleMatches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.overlapHours !== a.overlapHours) return b.overlapHours - a.overlapHours;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a._id.toString().localeCompare(b._id.toString());
  });

  return {
    sourceRequest: serializeInterestRequest(sourceRequest, currentUserId),
    matches: eligibleMatches.map(({ targetRequest, score, matchReasons }) => ({
      targetRequest,
      score,
      matchReasons
    }))
  };
}

/**
 * Finds matches across all active interest requests of the user.
 */
async function findMatchesForUser({ userId, query = {} }) {
  if (query.requestId) {
    return findMatchesForRequest({ requestId: query.requestId, currentUserId: userId });
  }

  const activeRequests = await InterestRequest.find({
    userId,
    status: 'active',
    timeEnd: { $gt: new Date() }
  }).exec();

  const results = [];
  for (const req of activeRequests) {
    const matchResult = await findMatchesForRequest({
      requestId: req._id,
      currentUserId: userId
    });
    results.push(matchResult);
  }

  return results;
}

module.exports = {
  findMatchesForRequest,
  findMatchesForUser,
  evaluateMatch,
  calculateDistanceKm
};
