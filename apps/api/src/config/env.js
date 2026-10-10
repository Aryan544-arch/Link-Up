const { z } = require('zod');
const dotenv = require('dotenv');

// Load environment variables from .env file if present
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/meetup_pulse'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(16).default('meetup-pulse-dev-secret-key-at-least-16-chars')
});

function loadEnv(envInput = process.env) {
  const result = envSchema.safeParse(envInput);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return Object.freeze(result.data);
}

const env = loadEnv(process.env);

module.exports = {
  env,
  loadEnv,
  envSchema
};
