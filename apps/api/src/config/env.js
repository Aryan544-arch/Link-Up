const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

// Load .env from project root or current working directory if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/meetup_pulse'),
  SESSION_SECRET: z.string().min(16).default('meetup-pulse-dev-secret-key-at-least-16-chars'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  ENABLE_AI: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(false)
  ),
  AI_PROVIDER_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('gemini-1.5-flash')
});

function loadEnv(envInput = process.env) {
  const result = envSchema.safeParse(envInput);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}

const env = loadEnv(process.env);

const exportTarget = { ...env };
exportTarget.env = env;
exportTarget.loadEnv = loadEnv;
exportTarget.envSchema = envSchema;

module.exports = exportTarget;
