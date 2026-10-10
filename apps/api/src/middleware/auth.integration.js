const { apiError } = require('../utils/apiResponse');

/**
 * Authentication Integration Point — MEETUP Pulse
 *
 * Owner: Person 3 (Authentication and AI)
 *
 * Integration Contract:
 * --------------------
 * 1. Session Middleware:
 *    Person 3 configures `express-session` with:
 *    - Secure HTTP-only, SameSite cookies
 *    - Production store (e.g. connect-mongo)
 *    - Injected in Express app before routes.
 *
 * 2. Route Protection Middleware (`requireAuth`):
 *    - Verifies active session on protected endpoints
 *    - Attaches verified user document to `req.user` (including `req.user._id`)
 *    - If unauthenticated, returns HTTP 401 UNAUTHORIZED with standard error envelope.
 *
 * 3. Optional Authentication Middleware (`optionalAuth`):
 *    - Used on public endpoints (e.g. GET /api/activities, GET /api/activities/:id)
 *    - If session is present, attaches user to `req.user` so organizer privileges
 *      (like unmasking precise meeting coordinates) can be determined.
 *    - If unauthenticated, request proceeds as a public guest.
 */

/**
 * Safely extracts the authenticated user ID from req.user.
 * Prefers `req.user.id` (Person 3 contract) and falls back to `req.user._id` for compatibility.
 * Returns null if unauthenticated or if no valid user ID is present.
 */
function getAuthUserId(req) {
  if (!req || !req.user) return null;
  return req.user.id || req.user._id || null;
}

function requireAuth(req, res, next) {
  const userId = getAuthUserId(req);
  if (userId) {
    return next();
  }

  return apiError(res, {
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentication required. Please log in.'
  });
}

function optionalAuth(req, res, next) {
  // Pass-through: if session middleware attached req.user, it will be available.
  // If unauthenticated, req.user remains undefined and request proceeds normally.
  next();
}

/**
 * Deserializes active session into req.user if session cookie is present.
 * Does not overwrite req.user if already populated (e.g. in unit tests).
 */
async function attachSessionUser(req, res, next) {
  if (req.user && (req.user.id || req.user._id)) {
    return next();
  }

  if (req.session && req.session.userId) {
    try {
      const User = require('../models/User');
      const user = await User.findById(req.session.userId).exec();
      if (user) {
        req.user = {
          id: user._id.toString(),
          _id: user._id,
          email: user.email,
          displayName: user.displayName,
          bio: user.bio,
          avatar: user.avatar
        };
      } else {
        delete req.session.userId;
      }
    } catch (err) {
      console.error('[Auth] Error deserializing session user:', err.message);
    }
  }

  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  getAuthUserId,
  attachSessionUser
};
