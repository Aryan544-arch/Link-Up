const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const {
  validateBody,
  validateQuery,
  validateObjectIdParam
} = require('../middleware/validate');
const {
  decideProposalSchema,
  proposalQuerySchema
} = require('../validators/proposal.validator');
const proposalController = require('../controllers/proposal.controller');

function createProposalRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // List proposals for the authenticated user
  router.get(
    '/',
    authMiddleware,
    validateQuery(proposalQuerySchema),
    proposalController.listProposals
  );

  // Get specific proposal details
  router.get(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    proposalController.getProposal
  );

  // Recipient accepts or rejects a proposal
  router.patch(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(decideProposalSchema),
    proposalController.decideProposal
  );

  // Proposer cancels a pending proposal
  router.post(
    '/:id/cancel',
    authMiddleware,
    validateObjectIdParam('id'),
    proposalController.cancelProposal
  );

  return router;
}

module.exports = {
  createProposalRouter,
  defaultProposalRouter: createProposalRouter()
};
