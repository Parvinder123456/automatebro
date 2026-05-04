/**
 * Logger — Pino with redaction baked in.
 *
 * Per spec 001 §6.3 and CLAUDE.md security rules: secrets must never
 * appear in log output. We redact common credential field names and
 * any path containing "password", "token", "secret", etc.
 *
 * Usage (production):
 *   import { logger } from '@automatebro/shared/logger';
 *   logger.info({ tenantId }, 'tenant created');
 *
 * Usage (tests):
 *   const logger = createLogger({ stream: customWritable, level: 'info' });
 */
import type { Writable } from 'node:stream';
import pino, { type Logger as PinoLogger } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface CreateLoggerOptions {
  /** Custom write stream — useful for tests to capture output. */
  stream?: Writable;
  /** Minimum level to emit. Defaults to env LOG_LEVEL or 'info'. */
  level?: LogLevel;
}

/**
 * Field paths Pino will replace with `[Redacted]` before serialization.
 * Conservative list — favours false positives (over-redaction) over
 * leaking a secret. Includes both camelCase forms used in app code AND
 * the SCREAMING_SNAKE_CASE env-var names (in case a caught error logs
 * a config object that includes them).
 */
const REDACT_PATHS = [
  // Connection strings (any nesting up to 2 deep)
  'uri',
  '*.uri',
  '*.*.uri',
  'redisUrl',
  '*.redisUrl',
  '*.*.redisUrl',
  // Env-var names (covers `logger.error({ err, ...env })` accidents)
  'STRICTDB_URI',
  '*.STRICTDB_URI',
  'REDIS_URL',
  '*.REDIS_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  '*.SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  '*.SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  '*.OPENAI_API_KEY',
  'META_APP_SECRET',
  '*.META_APP_SECRET',
  'META_IG_APP_SECRET',
  '*.META_IG_APP_SECRET',
  'WEBHOOK_VERIFY_TOKEN',
  '*.WEBHOOK_VERIFY_TOKEN',
  'RAZORPAY_KEY_ID',
  '*.RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  '*.RAZORPAY_KEY_SECRET',
  'STRIPE_SECRET_KEY',
  '*.STRIPE_SECRET_KEY',
  'RESEND_API_KEY',
  '*.RESEND_API_KEY',
  // Common secret field names (camelCase / lowercase)
  'password',
  '*.password',
  '*.*.password',
  'token',
  '*.token',
  '*.*.token',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  // Meta-specific (anticipating spec 004/005)
  'accessToken',
  '*.accessToken',
  'accessTokenCiphertext',
  '*.accessTokenCiphertext',
  'pageAccessToken',
  '*.pageAccessToken',
  // Razorpay / Stripe (anticipating spec 010)
  'razorpaySecret',
  '*.razorpaySecret',
  'stripeSecret',
  '*.stripeSecret',
];

const VALID_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

function levelFromEnv(): LogLevel | undefined {
  // Read process.env directly here (not via loadEnv) because the logger
  // is initialised at module load before loadEnv() is safe to call —
  // loadEnv would throw on missing STRICTDB_URI. We accept the cost of
  // a string compare; an invalid LOG_LEVEL silently falls back to 'info'
  // rather than crashing the boot.
  const raw = process.env.LOG_LEVEL;
  if (raw && VALID_LEVELS.has(raw as LogLevel)) {
    return raw as LogLevel;
  }
  return undefined;
}

export function createLogger(options: CreateLoggerOptions = {}): PinoLogger {
  const level = options.level ?? levelFromEnv() ?? 'info';
  const baseOptions = {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  } as const;

  if (options.stream) {
    return pino(baseOptions, options.stream);
  }
  return pino(baseOptions);
}

/** Default process-wide logger. */
export const logger: PinoLogger = createLogger();
