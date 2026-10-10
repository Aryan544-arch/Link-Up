const express = require('express');
const { getDatabaseStatus } = require('../config/db');
const { apiSuccess } = require('../utils/apiResponse');

const router = express.Router();

router.get('/health', (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isDbConnected = dbStatus.status === 'connected';

  const healthData = {
    status: isDbConnected ? 'ok' : 'degraded',
    service: 'meetup-pulse-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus.status,
      readyState: dbStatus.readyState
    }
  };

  return apiSuccess(res, healthData, 200);
});

module.exports = router;
