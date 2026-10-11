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

    // Graceful shutdown handling
    async function gracefulShutdown(signal) {
      console.log(`[Server] Received ${signal}. Closing HTTP server...`);
      server.close(async () => {
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
  } catch (err) {
    console.error('[Server] Failed to start server:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
