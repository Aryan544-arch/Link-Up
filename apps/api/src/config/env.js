const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

// Load .env from project root if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/meetup_pulse'),
  SESSION_SECRET: z.string().min(16).default('development-session-secret-change-in-production-min32'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  ENABLE_AI: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(false)
  ),
  AI_PROVIDER_API_KEY: z.string().optional().default('')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
  throw new Error(`Environment validation failed: ${issues}`);
}

module.exports = parsed.data;
