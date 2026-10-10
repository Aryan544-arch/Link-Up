const { Report } = require('../models/Report');
const Block = require('../models/Block');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Proposal = require('../models/Proposal');
const mongoose = require('mongoose');

/**
 * Creates and persists a user or content moderation report.
 */
async function createReport({ reporterId, targetType, targetId, reason, details }) {
  if (!reporterId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // Verify target existence and self-reporting
  if (targetType === 'user') {
    if (targetId.toString() === reporterId.toString()) {
      const err = new Error('You cannot report yourself.');
      err.statusCode = 400;
      err.code = 'CANNOT_REPORT_SELF';
      throw err;
    }
    const targetUser = await User.findById(targetId).exec();
    if (!targetUser) {
      const err = new Error('Reported user not found.');
      err.statusCode = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }
  } else if (targetType === 'activity') {
    const targetActivity = await Activity.findById(targetId).exec();
    if (!targetActivity) {
      const err = new Error('Reported activity not found.');
      err.statusCode = 404;
      err.code = 'ACTIVITY_NOT_FOUND';
      throw err;
    }
    if (targetActivity.organizerId.toString() === reporterId.toString()) {
      const err = new Error('You cannot report your own activity.');
      err.statusCode = 400;
      err.code = 'CANNOT_REPORT_OWN_ACTIVITY';
      throw err;
    }
  } else if (targetType === 'proposal') {
    const targetProposal = await Proposal.findById(targetId).exec();
    if (!targetProposal) {
      const err = new Error('Reported proposal not found.');
      err.statusCode = 404;
      err.code = 'PROPOSAL_NOT_FOUND';
      throw err;
    }
  }

  const report = new Report({
    reporterId,
    targetType,
    targetId,
    reason,
    details: details || '',
    status: 'pending'
  });

  return report.save();
}

/**
 * Blocks another user, preventing interaction and filtering their activities from discovery.
 */
async function blockUser({ blockerId, blockedUserId, reason }) {
  if (!blockerId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (blockerId.toString() === blockedUserId.toString()) {
    const err = new Error('You cannot block yourself.');
    err.statusCode = 400;
    err.code = 'CANNOT_BLOCK_SELF';
    throw err;
  }

  const targetUser = await User.findById(blockedUserId).exec();
  if (!targetUser) {
    const err = new Error('User to block not found.');
    err.statusCode = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  try {
    const block = new Block({
      blockerId,
      blockedUserId,
      reason: reason || ''
    });
    return await block.save();
  } catch (err) {
    if (err.code === 11000) {
      const dupErr = new Error('User is already blocked.');
      dupErr.statusCode = 409;
      dupErr.code = 'ALREADY_BLOCKED';
      throw dupErr;
    }
    throw err;
  }
}

/**
 * Retrieves array of string user IDs blocked by the specified user.
 */
async function getBlockedUserIds(blockerId) {
  if (!blockerId) return [];
  const blocks = await Block.find({ blockerId }).select('blockedUserId').exec();
  return blocks.map((b) => b.blockedUserId.toString());
}

/**
 * Unblocks a previously blocked user.
 */
async function unblockUser({ blockerId, blockedUserId }) {
  if (!blockerId) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
    const err = new Error('Invalid user ID format.');
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }

  const result = await Block.findOneAndDelete({
    blockerId,
    blockedUserId
  }).exec();

  if (!result) {
    const err = new Error('Block record not found.');
    err.statusCode = 404;
    err.code = 'BLOCK_NOT_FOUND';
    throw err;
  }

  return { unblocked: true, blockedUserId };
}

module.exports = {
  createReport,
  blockUser,
  getBlockedUserIds,
  unblockUser
};
