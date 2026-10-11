const session = require('express-session');
const connectMongo = require('connect-mongo');
const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;
const env = require('./env');

let sessionStore = null;

function configureSession() {
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';

  sessionStore = MongoStore.create({
    mongoUrl: env.MONGODB_URI,
    collectionName: isTest ? 'test_sessions' : 'sessions',
    ttl: 60 * 60 * 24 * 7, // 7 days in seconds
    autoRemove: isTest ? 'disabled' : 'native',
    touchAfter: 24 * 3600 // lazy session updates (once every 24h if unchanged)
  });

  const sessionOptions = {
    name: 'connect.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  };

  return session(sessionOptions);
}

async function closeSessionStore() {
  if (sessionStore && typeof sessionStore.close === 'function') {
    await sessionStore.close();
    sessionStore = null;
  }
}

module.exports = { configureSession, closeSessionStore };
