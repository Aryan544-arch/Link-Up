const { ZodError } = require('zod');
const { apiError } = require('../utils/apiResponse');
const { env } = require('../config/env');

function errorHandler(err, req, res, next) {
  // Handle Zod request validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message
    }));
    return apiError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details
    });
  }

  // Handle invalid/malformed JSON in request bodies
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return apiError(res, {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON payload in request body'
    });
  }

  // Handle explicit status codes or default to 500
  const statusCode = err.statusCode || err.status || 500;
  const isServerFault = statusCode >= 500;
  const code = err.code && typeof err.code === 'string'
    ? err.code
    : (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  const message = isServerFault && env.NODE_ENV === 'production'
    ? 'An internal server error occurred'
    : (err.message || 'An unexpected error occurred');

  if (isServerFault && env.NODE_ENV !== 'test') {
    console.error('[Error] Unhandled application error:', err);
  }

  return apiError(res, {
    statusCode,
    code,
    message,
    details: env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : null
  });
}

module.exports = {
  errorHandler
};
