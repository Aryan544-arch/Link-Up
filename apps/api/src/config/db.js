const mongoose = require('mongoose');
const env = require('./env');

const connectionStates = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  return {
    status: connectionStates[readyState] || 'unknown',
    readyState,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

let isConnected = false;

async function connectDatabase(uri = env.MONGODB_URI) {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => {
    const host = mongoose.connection.host || 'remote';
    console.log(`[Database] MongoDB connected successfully to ${host}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[Database] MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('[Database] MongoDB disconnected');
  });

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  isConnected = true;
  return conn;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  connectDB: connectDatabase,
  disconnectDB: disconnectDatabase,
  getDatabaseStatus,
  connectionStates
};
