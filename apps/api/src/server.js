const { app } = require('./app');
const { env } = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/db');

let server;

async function startServer() {
  try {
    console.log(`[Server] Starting MEETUP Pulse API in ${env.NODE_ENV} mode...`);

    // Attempt MongoDB connection
    try {
      await connectDatabase(env.MONGODB_URI);
    } catch (dbErr) {
      console.warn(`[Server] MongoDB initial connection failed: ${dbErr.message}`);
      console.warn('[Server] Continuing startup. Ensure MongoDB is running and MONGODB_URI is valid.');
    }

    server = app.listen(env.PORT, () => {
      console.log(`[Server] MEETUP Pulse API listening on port ${env.PORT}`);
      console.log(`[Server] Allowed CORS origin: ${env.CLIENT_ORIGIN}`);
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(() => {
      console.log('[Server] HTTP server closed.');
    });
  }

  try {
    await disconnectDatabase();
    console.log('[Server] Database connection closed.');
  } catch (err) {
    console.error('[Server] Error while disconnecting database:', err.message);
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
  shutdown
};
