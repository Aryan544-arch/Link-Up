const express = require('express');
const {
  requireAuth: defaultRequireAuth,
  optionalAuth: defaultOptionalAuth
} = require('../middleware/auth.integration');
const {
  validateBody,
  validateQuery,
  validateObjectIdParam
} = require('../middleware/validate');
const {
  createActivitySchema,
  updateActivitySchema,
  activitySearchQuerySchema
} = require('../validators/activity.validator');
const {
  createJoinRequestSchema
} = require('../validators/joinRequest.validator');
const activityController = require('../controllers/activity.controller');
const joinRequestController = require('../controllers/joinRequest.controller');

function createActivityRouter({
  authMiddleware = defaultRequireAuth,
  optionalAuthMiddleware = defaultOptionalAuth
} = {}) {
  const router = express.Router();

  // Discovery with geospatial radius, filters, and pagination
  router.get(
    '/',
    optionalAuthMiddleware,
    validateQuery(activitySearchQuerySchema),
    activityController.listActivities
  );

  // Create activity in draft status (Auth Required)
  router.post(
    '/',
    authMiddleware,
    validateBody(createActivitySchema),
    activityController.createActivity
  );

  // Retrieve activity details with privacy-safe serialization
  router.get(
    '/:id',
    optionalAuthMiddleware,
    validateObjectIdParam('id'),
    activityController.getActivity
  );

  // Update permitted fields with organizer ownership checks (Auth Required)
  router.patch(
    '/:id',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(updateActivitySchema),
    activityController.updateActivity
  );

  // Explicit publishing transition (Auth Required)
  router.post(
    '/:id/publish',
    authMiddleware,
    validateObjectIdParam('id'),
    activityController.publishActivity
  );

  // Organizer cancellation (Auth Required)
  router.post(
    '/:id/cancel',
    authMiddleware,
    validateObjectIdParam('id'),
    activityController.cancelActivity
  );

  // Request to join an activity (Auth Required)
  router.post(
    '/:id/join',
    authMiddleware,
    validateObjectIdParam('id'),
    validateBody(createJoinRequestSchema),
    joinRequestController.createJoinRequest
  );

  // View join requests for an activity (Organizer Only, Auth Required)
  router.get(
    '/:id/requests',
    authMiddleware,
    validateObjectIdParam('id'),
    joinRequestController.getRequestsForActivity
  );

  return router;
}

module.exports = {
  createActivityRouter,
  defaultActivityRouter: createActivityRouter()
};
