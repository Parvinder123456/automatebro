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

export const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    STRICTDB_URI: z.string().url(),
    REDIS_URL: z.string().url(),
    // Supabase (spec 002+) — anon key + URLs are required for the web app.
    // SUPABASE_SERVICE_ROLE_KEY is INTENTIONALLY NOT in this schema:
    //   - The web app never needs it (we use the anon key from the browser
    //     and rely on Supabase Auth cookies for server-side operations).
    //   - Tests / admin scripts read it directly from process.env with an
    //     explicit skipIf gate, keeping the high-privilege key out of the
    //     web app's process memory and out of any cached env object.
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    // Meta (spec 004+) — Facebook Login for Business OAuth + Instagram Graph API.
    // META_APP_SECRET is also used as the HMAC key for the OAuth state cookie.
    // META_TOKEN_KEY is base64-encoded 32 random bytes (AES-256-GCM data key).
    // Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
    META_APP_ID: z.string().regex(/^\d+$/, 'META_APP_ID must be numeric'),
    META_APP_SECRET: z.string().min(16),
    META_TOKEN_KEY: z
      .string()
      .min(1)
      .refine((s) => Buffer.from(s, 'base64').length === 32, {
        message:
          'META_TOKEN_KEY must be base64-encoded 32 random bytes (use openssl rand -base64 32)',
      }),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  })
  // Defence-in-depth: a misconfigured deploy could point browser and server
  // at different Supabase projects. Catch it at boot.
  .refine((e) => e.SUPABASE_URL === e.NEXT_PUBLIC_SUPABASE_URL, {
    message: 'SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must be identical',
    path: ['NEXT_PUBLIC_SUPABASE_URL'],
  })
  .refine((e) => e.SUPABASE_ANON_KEY === e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    message: 'SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY must be identical',
    path: ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  });

/**
 * Public env values safe to bake into the browser bundle. Read in
 * `apps/web/lib/supabase/browser.ts` instead of `process.env` directly so
 * the project rule "process.env only in env.ts" is preserved.
 *
 * These reads happen at module-load time on the server (during Next's
 * build), then Next inlines the literal strings into the client bundle.
 */
export const PublicEnv = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

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
