const { ZodError } = require('zod');
const env = require('../config/env');

// 404 Not Found handler for unmatched routes
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Resource not found: Cannot ${req.method} ${req.originalUrl}`
    }
  });
}

// Centralized error-handling middleware
function errorHandler(err, req, res, next) {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const rawIssues = err.issues || err.errors || [];
    const details = rawIssues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }));
    const fields = {};
    rawIssues.forEach((issue) => {
      const fieldName = issue.path.join('.') || 'root';
      fields[fieldName] = issue.message;
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
        fields
      }
    });
  }

  // Handle invalid/malformed JSON in request bodies
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Malformed JSON payload in request body'
      }
    });
  }

  // Handle explicit status codes on error object
  const statusCode = err.statusCode || err.status || 500;
  const isServerFault = statusCode >= 500;
  const errorCode = err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'ERROR');

  const errorResponse = {
    code: errorCode,
    message: isServerFault && env.NODE_ENV === 'production'
      ? 'An unexpected internal error occurred'
      : (err.message || 'An unexpected error occurred')
  };

  if (err.details) {
    errorResponse.details = err.details;
  }
  if (err.fields) {
    errorResponse.fields = err.fields;
  }

  // Never leak internal stack traces to client in production
  if (env.NODE_ENV === 'development' && err.stack) {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json({
    success: false,
    error: errorResponse
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
