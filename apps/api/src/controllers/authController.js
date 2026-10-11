const { registerSchema, loginSchema, verifyEmailSchema } = require('../validators/authValidators');
const { registerUser, authenticateUser, verifyEmailToken } = require('../services/authService');
const { toPublicUser } = require('../utils/userSerializer');

/**
 * Register a new user
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const validatedData = registerSchema.parse(req.body);
    const newUser = await registerUser(validatedData);

    if (req.session) {
      req.session.userId = newUser._id ? newUser._id.toString() : newUser.id;
    }

    res.status(201).json({
      success: true,
      data: toPublicUser(newUser)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Log in an existing user
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const validatedData = loginSchema.parse(req.body);
    const user = await authenticateUser(validatedData);

    // Regenerate session to prevent session fixation attacks
    if (req.session && typeof req.session.regenerate === 'function') {
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // Store only the user identifier in the session
    const userIdStr = user._id ? user._id.toString() : user.id;
    if (req.session) {
      req.session.userId = userIdStr;
    }

    // Persist session before returning response
    if (req.session && typeof req.session.save === 'function') {
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    res.status(200).json({
      success: true,
      data: toPublicUser(user)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify user email address
 * GET /api/auth/verify-email?token=...
 * POST /api/auth/verify-email
 */
async function verifyEmail(req, res, next) {
  try {
    const token = req.query.token || req.body?.token;
    const validatedData = verifyEmailSchema.parse({ token });

    const updatedUser = await verifyEmailToken(validatedData.token);

    res.status(200).json({
      success: true,
      data: {
        message: 'Email successfully verified',
        isVerified: true,
        user: toPublicUser(updatedUser)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Log out current user
 * POST /api/auth/logout
 */
async function logout(req, res, next) {
  try {
    if (req.session && typeof req.session.destroy === 'function') {
      req.session.destroy((err) => {
        if (err) {
          return next(err);
        }
        res.clearCookie('connect.sid');
        res.status(200).json({
          success: true,
          data: {
            loggedOut: true,
            message: 'Logged out successfully'
          }
        });
      });
    } else {
      res.clearCookie('connect.sid');
      res.status(200).json({
        success: true,
        data: {
          loggedOut: true,
          message: 'Logged out successfully'
        }
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
async function getCurrentUser(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please log in.'
        }
      });
    }

    const publicUser = toPublicUser(user);
    if (user.bio !== undefined && publicUser) {
      publicUser.bio = user.bio;
    }

    res.status(200).json({
      success: true,
      data: publicUser
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  verifyEmail,
  logout,
  getCurrentUser
};
