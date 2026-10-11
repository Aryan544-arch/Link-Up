const mongoose = require('mongoose');
const env = require('./env');

let isConnected = false;

async function connectDB(uri = env.MONGODB_URI) {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  isConnected = true;
  return conn;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
}

module.exports = { connectDB, disconnectDB };
