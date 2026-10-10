/**
 * Standardized API Response Utilities for MEETUP Pulse
 *
 * Success envelope format:
 * {
 *   "success": true,
 *   "data": { ... }
 * }
 *
 * Error envelope format:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "ERROR_CODE",
 *     "message": "Human readable message",
 *     "details": null | [ ... ]
 *   }
 * }
 */

function apiSuccess(res, data = null, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data
  });
}

function apiError(res, {
  statusCode = 500,
  code = 'INTERNAL_SERVER_ERROR',
  message = 'An unexpected error occurred',
  details = null
} = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });
}

module.exports = {
  apiSuccess,
  apiError
};
