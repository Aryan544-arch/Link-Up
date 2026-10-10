const proposalService = require('../services/proposal.service');
const { apiSuccess } = require('../utils/apiResponse');
const { getAuthUserId } = require('../middleware/auth.integration');

async function createProposal(req, res, next) {
  try {
    const proposerId = getAuthUserId(req);
    const result = await proposalService.createProposal({
      sourceRequestId: req.params.id,
      payload: req.body,
      proposerId
    });
    return apiSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

async function listProposals(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const result = await proposalService.getProposals({
      userId,
      query: req.query
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function getProposal(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await proposalService.getProposalById({
      proposalId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function decideProposal(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await proposalService.decideProposal({
      proposalId: req.params.id,
      decision: req.body.decision,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

async function cancelProposal(req, res, next) {
  try {
    const currentUserId = getAuthUserId(req);
    const result = await proposalService.cancelProposal({
      proposalId: req.params.id,
      currentUserId
    });
    return apiSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createProposal,
  listProposals,
  getProposal,
  decideProposal,
  cancelProposal
};
