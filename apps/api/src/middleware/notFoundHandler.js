const { apiError } = require('../utils/apiResponse');

function notFoundHandler(req, res) {
  return apiError(res, {
    statusCode: 404,
    code: 'NOT_FOUND',
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  notFoundHandler
};
