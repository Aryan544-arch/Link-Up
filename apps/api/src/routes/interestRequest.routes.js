const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const {
  validateBody,
  validateQuery,
  validateObjectIdParam
} = require('../middleware/validate');
const {
  createInterestRequestSchema,
  updateInterestRequestSchema,
  interestRequestQuerySchema
} = require('../validators/interestRequest.validator');
const { createProposalSchema } = require('../validators/proposal.validator');
const interestRequestController = require('../controllers/interestRequest.controller');
const proposalController = require('../controllers/proposal.controller');

function createInterestRequestRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // Create an active interest request
  router.post(
    '/',
    authMiddleware,
    validateBody(createInterestRequestSchema),
    interestRequestController.createInterestRequest
  );

  // List authenticated user's interest requests
  router.get(
    '/',
    authMiddleware,
    validateQuery(interestRequestQuerySchema),
    interestRequestController.listInterestRequests
  );

  // Discover matches across user's active requests
  router.get(
    '/matches',
    authMiddleware,
    interestRequestController.getMatchesForUser
  );

  // Get specific interest request details
  router.get(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    interestRequestController.getInterestRequest
  );

  // Update permitted fields on active interest request
  router.patch(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(updateInterestRequestSchema),
    interestRequestController.updateInterestRequest
  );

  // Cancel / withdraw active interest request
  router.post(
    '/:id/cancel',
    authMiddleware,
    validateObjectIdParam('id'),
    interestRequestController.cancelInterestRequest
  );

  // Find deterministic matches for a specific interest request
  router.get(
    '/:id/matches',
    authMiddleware,
    validateObjectIdParam('id'),
    interestRequestController.getMatchesForRequest
  );

  // Create a proposal targeting a matched interest request
  router.post(
    '/:id/proposals',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(createProposalSchema),
    proposalController.createProposal
  );

  return router;
}

module.exports = {
  createInterestRequestRouter,
  defaultInterestRequestRouter: createInterestRequestRouter()
};
