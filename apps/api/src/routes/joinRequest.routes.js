const express = require('express');
const { requireAuth: defaultRequireAuth } = require('../middleware/auth.integration');
const {
  validateBody,
  validateObjectIdParam
} = require('../middleware/validate');
const {
  updateJoinRequestDecisionSchema,
  cancelJoinRequestSchema
} = require('../validators/joinRequest.validator');
const joinRequestController = require('../controllers/joinRequest.controller');

function createJoinRequestRouter({ authMiddleware = defaultRequireAuth } = {}) {
  const router = express.Router();

  // Organizer decision on a join request (approve/reject)
  router.patch(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(updateJoinRequestDecisionSchema),
    joinRequestController.decideRequest
  );

  // Requester cancellation of their own join request
  router.post(
    '/:id/cancel',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(cancelJoinRequestSchema),
    joinRequestController.cancelOwnRequest
  );

  return router;
}

module.exports = {
  createJoinRequestRouter,
  defaultJoinRequestRouter: createJoinRequestRouter()
};
