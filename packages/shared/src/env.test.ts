/**
 * Spec 001 §11.1 — env validation tests.
 *
 * U1: throws when STRICTDB_URI is missing
 * U2: defaults NODE_ENV and LOG_LEVEL when valid required vars provided
 * U3: rejects malformed STRICTDB_URI
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Env } from './env.js';

describe('packages/shared/src/env.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset only the vars we manage so unrelated env stays intact.
    process.env.NODE_ENV = undefined;
    process.env.LOG_LEVEL = undefined;
    process.env.STRICTDB_URI = undefined;
    process.env.REDIS_URL = undefined;
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
    const result = Env.parse({
      STRICTDB_URI: 'postgresql://user:pass@host.example.com:5432/db',
      REDIS_URL: 'rediss://default:secret@host.upstash.io:6379',
    });
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('info');
  });

  it('U2b: accepts test/production NODE_ENV values', () => {
    for (const value of ['development', 'test', 'production'] as const) {
      const result = Env.parse({
        NODE_ENV: value,
        STRICTDB_URI: 'postgresql://user:pass@host.example.com:5432/db',
        REDIS_URL: 'rediss://default:secret@host.upstash.io:6379',
      });
      expect(result.NODE_ENV).toBe(value);
    }
  });

  it('U3: rejects malformed STRICTDB_URI', () => {
    expect(() =>
      Env.parse({
        STRICTDB_URI: 'not-a-url',
        REDIS_URL: 'rediss://default:secret@host.upstash.io:6379',
      }),
    ).toThrowError(/STRICTDB_URI/);
  });

  it('U3b: rejects malformed REDIS_URL', () => {
    expect(() =>
      Env.parse({
        STRICTDB_URI: 'postgresql://user:pass@host.example.com:5432/db',
        REDIS_URL: 'totally-not-a-url',
      }),
    ).toThrowError(/REDIS_URL/);
  });

  it('U3c: rejects unknown NODE_ENV value', () => {
    expect(() =>
      Env.parse({
        NODE_ENV: 'staging',
        STRICTDB_URI: 'postgresql://user:pass@host.example.com:5432/db',
        REDIS_URL: 'rediss://default:secret@host.upstash.io:6379',
      }),
    ).toThrowError(/NODE_ENV/);
  });
});
