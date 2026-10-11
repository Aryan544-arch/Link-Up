const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

async function startServer() {
  try {
    await connectDB();
    console.log(`[MongoDB] Connected successfully to database.`);

    const server = app.listen(env.PORT, () => {
      console.log(`[MEETUP Pulse API] Server running on http://localhost:${env.PORT} in ${env.NODE_ENV} mode`);
    });

    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[Server] Port ${env.PORT} is already in use (EADDRINUSE). Another instance may be running or shutting down.`
        );
      } else {
        console.error('[Server] HTTP server error:', err.message);
      }
      try {
        await disconnectDB();
      } catch {}
      process.exit(1);
    });

    // Graceful shutdown handling
    let isShuttingDown = false;
    async function gracefulShutdown(signal) {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`[Server] Received ${signal}. Closing HTTP server...`);

      // Force kill after 5 seconds if connections stall
      const forceTimer = setTimeout(() => {
        console.warn('[Server] Forcing shutdown after timeout.');
        process.exit(1);
      }, 5000);
      forceTimer.unref();

      server.close(async () => {
        clearTimeout(forceTimer);
        console.log('[Server] HTTP server closed.');
        try {
          await disconnectDB();
          console.log('[MongoDB] Connection closed.');
          process.exit(0);
        } catch (err) {
          console.error('[MongoDB] Error during disconnection:', err);
          process.exit(1);
        }
      });
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
  } catch (err) {
    console.error('[Server] Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
