/**
 * Environment validation. Single source of truth for env vars.
 *
 * Per CLAUDE.md and spec 001 §6.2: no other file in apps/** or
 * packages/** may read process.env directly. They import { Env } from
 * here.
 *
 * Usage:
 *   const env = Env.parse(process.env);
 *   // or for the cached singleton:
 *   const env = loadEnv();
 *
 * Missing or malformed env causes a Zod error at boot — fail-fast,
 * not lazy.
 */
import { z } from 'zod';

export const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STRICTDB_URI: z.string().url(),
  REDIS_URL: z.string().url(),
  // Reserved for spec 002 — not consumed in spec 001.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type EnvType = z.infer<typeof Env>;

let cached: EnvType | null = null;

/**
 * Parse and cache env. Call once at process boot. Subsequent calls
 * return the cached value.
 */
export function loadEnv(): EnvType {
  if (cached === null) {
    cached = Env.parse(process.env);
  }
  return cached;
}

/** Test-only: clear the cache. */
export function _resetEnvCache(): void {
  cached = null;
}
