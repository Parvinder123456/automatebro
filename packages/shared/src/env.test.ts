/**
 * Spec 001 §11.1 + spec 002 §10.1 — env validation tests.
 *
 * U1: throws when STRICTDB_URI is missing
 * U2: defaults NODE_ENV and LOG_LEVEL when valid required vars provided
 * U3: rejects malformed STRICTDB_URI
 *
 * Spec 002 additions:
 * S-U1: SUPABASE_URL is required
 * S-U2: NEXT_PUBLIC_SUPABASE_URL is required
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Env } from './env.js';

const VALID_INFRA = {
  STRICTDB_URI: 'postgresql://user:pass@host.example.com:5432/db',
  REDIS_URL: 'rediss://default:secret@host.upstash.io:6379',
  SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'eyJanon',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJanon',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJservice',
} as const;

describe('packages/shared/src/env.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset only the vars we manage so unrelated env stays intact.
    // `delete` is required here — `process.env.X = undefined` sets
    // the literal string "undefined" in Node.js. Biome flags `delete`
    // for perf, but it's the correct primitive for env unsetting.
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.NODE_ENV;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.LOG_LEVEL;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.STRICTDB_URI;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.REDIS_URL;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.SUPABASE_URL;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.SUPABASE_ANON_KEY;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // biome-ignore lint/performance/noDelete: env-var unset semantics
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('U1: throws when STRICTDB_URI is missing', () => {
    expect(() => Env.parse({})).toThrowError(/STRICTDB_URI/);
  });

  it('U1b: throws when REDIS_URL is missing', () => {
    expect(() => Env.parse({ STRICTDB_URI: 'postgresql://u:p@host:5432/db' })).toThrowError(
      /REDIS_URL/,
    );
  });

  it('U2: defaults NODE_ENV to "development" and LOG_LEVEL to "info"', () => {
    const result = Env.parse(VALID_INFRA);
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('U2b: accepts test/production NODE_ENV values', () => {
    for (const value of ['development', 'test', 'production'] as const) {
      const result = Env.parse({ ...VALID_INFRA, NODE_ENV: value });
      expect(result.NODE_ENV).toBe(value);
    }
  });

  it('U3: rejects malformed STRICTDB_URI', () => {
    expect(() => Env.parse({ ...VALID_INFRA, STRICTDB_URI: 'not-a-url' })).toThrowError(
      /STRICTDB_URI/,
    );
  });

  it('U3b: rejects malformed REDIS_URL', () => {
    expect(() => Env.parse({ ...VALID_INFRA, REDIS_URL: 'totally-not-a-url' })).toThrowError(
      /REDIS_URL/,
    );
  });

  it('U3c: rejects unknown NODE_ENV value', () => {
    expect(() => Env.parse({ ...VALID_INFRA, NODE_ENV: 'staging' })).toThrowError(/NODE_ENV/);
  });

  // Spec 002 additions
  it('S-U1: throws when SUPABASE_URL is missing', () => {
    const { SUPABASE_URL: _omit, ...rest } = VALID_INFRA;
    expect(() => Env.parse(rest)).toThrowError(/SUPABASE_URL/);
  });

  it('S-U2: throws when NEXT_PUBLIC_SUPABASE_URL is missing', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _omit, ...rest } = VALID_INFRA;
    expect(() => Env.parse(rest)).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('S-U3: throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...rest } = VALID_INFRA;
    expect(() => Env.parse(rest)).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
