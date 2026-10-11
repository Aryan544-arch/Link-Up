const { ZodError } = require('zod');

// 404 Not Found handler for unmatched routes
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`
    }
  });
}

// Centralized error-handling middleware
function errorHandler(err, req, res, next) {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const fields = {};
    err.issues.forEach((issue) => {
      const fieldName = issue.path.join('.') || 'root';
      fields[fieldName] = issue.message;
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed for one or more fields',
        fields
      }
    });
  }

  // Handle explicit status codes on error object
  const statusCode = typeof err.status === 'number' ? err.status : 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'ERROR');

  const errorResponse = {
    code: errorCode,
    message: statusCode === 500 ? 'An unexpected internal error occurred' : err.message
  };

  if (err.fields) {
    errorResponse.fields = err.fields;
  }

  // Never leak internal stack traces to client
  res.status(statusCode).json({
    success: false,
    error: errorResponse
  });
}

module.exports = { notFoundHandler, errorHandler };
