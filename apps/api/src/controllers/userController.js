const { updateProfileSchema } = require('../validators/userValidators');
const { updateUserProfile, getUserById } = require('../services/userService');
const { toPublicUser } = require('../utils/userSerializer');

/**
 * Update authenticated user's profile and preferences
 * PATCH /api/users/me
 */
async function updateMe(req, res, next) {
  try {
    const validatedData = updateProfileSchema.parse(req.body);

    // Derive identity strictly from req.user.id populated by requireAuth
    const updatedUser = await updateUserProfile(req.user.id, validatedData);

    res.status(200).json({
      success: true,
      data: toPublicUser(updatedUser)
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get authenticated user's profile
 * GET /api/users/me
 */
async function getMe(req, res, next) {
  try {
    const user = await getUserById(req.user.id);

    res.status(200).json({
      success: true,
      data: toPublicUser(user)
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateMe,
  getMe
};
