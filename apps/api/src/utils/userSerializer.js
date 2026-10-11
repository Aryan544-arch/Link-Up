/**
 * Safely transforms a User Mongoose document or plain object
 * into a client-safe public user payload.
 *
 * Guaranteed to omit passwordHash, verificationToken, and verificationTokenExpiresAt.
 *
 * @param {Object} user - User document or plain JavaScript object
 * @returns {Object|null} Serialized public user object
 */
function toPublicUser(user) {
  if (!user) return null;

  if (typeof user.toPublicJSON === 'function') {
    return user.toPublicJSON();
  }

  const id = user.id || (user._id ? user._id.toString() : undefined);

  return {
    id,
    displayName: user.displayName,
    email: user.email,
    isVerified: Boolean(user.isVerified),
    searchRadiusKm: typeof user.searchRadiusKm === 'number' ? user.searchRadiusKm : 3,
    preferredArea: user.preferredArea || null,
    interests: Array.isArray(user.interests) ? user.interests : [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

module.exports = { toPublicUser };
