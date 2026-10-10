const safetyService = require('../services/safety.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function createReport(req, res, next) {
  try {
    const reporterId = getAuthUserId(req);
    const report = await safetyService.createReport({
      reporterId,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      reason: req.body.reason,
      details: req.body.details
    });
    return apiSuccess(res, report, 201);
  } catch (err) {
    next(err);
  }
}

async function createBlock(req, res, next) {
  try {
    const blockerId = getAuthUserId(req);
    const block = await safetyService.blockUser({
      blockerId,
      blockedUserId: req.body.blockedUserId,
      reason: req.body.reason
    });
    return apiSuccess(res, block, 201);
  } catch (err) {
    next(err);
  }
}

async function getBlocks(req, res, next) {
  try {
    const blockerId = getAuthUserId(req);
    const blockedUserIds = await safetyService.getBlockedUserIds(blockerId);
    return apiSuccess(res, { blockedUserIds });
  } catch (err) {
    next(err);
  }
}

async function deleteBlock(req, res, next) {
  try {
    const blockerId = getAuthUserId(req);
    const result = await safetyService.unblockUser({
      blockerId,
      blockedUserId: req.params.userId
    });
    return apiSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReport,
  createBlock,
  getBlocks,
  deleteBlock
};
