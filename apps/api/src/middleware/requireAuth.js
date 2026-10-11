const User = require('../models/User');

/**
 * Authentication guard middleware.
 * Verifies active session, loads user from database, and attaches req.user with req.user.id.
 * Rejects unauthenticated requests with standard 401 envelope.
 */
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please log in.'
      }
    });
  }

  try {
    const query = User.findById(req.session.userId);
    const user = query && typeof query.exec === 'function' ? await query.exec() : await query;

    if (!user) {
      // Session references a deleted or invalid user
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session is invalid or user no longer exists. Please log in again.'
        }
      });
    }

    // Attach authenticated user document and ensure req.user.id is string
    req.user = user;
    req.user.id = user._id.toString();

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
