const User = require('../models/User');

/**
 * Updates profile and preferences for the currently authenticated user.
 * Derived strictly from session user ID (never from request body/params).
 *
 * @param {string} userId - User's MongoDB ObjectId string from req.user.id
 * @param {Object} updateData - Validated profile update fields
 * @returns {Promise<Object>} Updated User document
 */
async function updateUserProfile(userId, updateData) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Update only supported profile/preference fields
  if (updateData.displayName !== undefined) {
    user.displayName = updateData.displayName.trim();
  }

  if (updateData.searchRadiusKm !== undefined) {
    user.searchRadiusKm = updateData.searchRadiusKm;
  }

  if (updateData.preferredArea !== undefined) {
    user.preferredArea = updateData.preferredArea ? updateData.preferredArea.trim() : null;
  }

  if (updateData.interests !== undefined) {
    // Trim and deduplicate interest tags
    const cleanInterests = [...new Set(updateData.interests.map((tag) => tag.trim()))];
    user.interests = cleanInterests;
  }

  await user.save();
  return user;
}

/**
 * Retrieves the user profile by ID.
 *
 * @param {string} userId - User's MongoDB ObjectId string
 * @returns {Promise<Object>} User document
 */
async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  return user;
}

module.exports = {
  updateUserProfile,
  getUserById
};
