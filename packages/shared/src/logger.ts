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
 * leaking a secret.
 */
const REDACT_PATHS = [
  // Connection strings (any nesting up to 2 deep)
  'uri',
  '*.uri',
  '*.*.uri',
  'redisUrl',
  '*.redisUrl',
  '*.*.redisUrl',
  'STRICTDB_URI',
  'REDIS_URL',
  // Common secret field names
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
  // Razorpay (anticipating spec 010)
  'razorpaySecret',
  '*.razorpaySecret',
];

export function createLogger(options: CreateLoggerOptions = {}): PinoLogger {
  const level = options.level ?? (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';
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
