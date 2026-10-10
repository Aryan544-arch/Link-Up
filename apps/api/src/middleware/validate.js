const mongoose = require('mongoose');
const { apiError } = require('../utils/apiResponse');

/**
 * Validates request body against a Zod schema.
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.body);
      req.body = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validates request query parameters against a Zod schema.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.query);
      req.query = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validates request path params against a Zod schema.
 */
function validateParams(schema) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req.params);
      req.params = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Validates that a route param is a valid 24-character hex MongoDB ObjectId.
 */
function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return apiError(res, {
        statusCode: 400,
        code: 'INVALID_ID',
        message: `Invalid ${paramName} parameter. Expected a 24-character hexadecimal ObjectId.`
      });
    }
    next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  validateObjectIdParam
};
