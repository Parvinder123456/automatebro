/**
 * Spec 001 §11.2 — StrictDB client integration tests.
 *
 * I1: getDb resolves with a usable client (postgresql backend).
 * I2: getDb is a singleton — two calls return the same instance.
 * I4: closeDb is idempotent — calling twice does not throw.
 *
 * REQUIRES: a real STRICTDB_URI in env (Supabase Postgres). These tests
 * are integration tests, not pure unit tests. They will be skipped if
 * STRICTDB_URI is not set so a clean clone with no .env still passes.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './client.js';

const hasInfra = Boolean(process.env.STRICTDB_URI);

describe.skipIf(!hasInfra)('packages/shared/src/db/client.ts (integration)', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('I1: getDb resolves with a usable StrictDB client', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
    // Smoke-check that the StrictDB API surface is present.
    expect(typeof db.queryOne).toBe('function');
    expect(typeof db.queryMany).toBe('function');
    expect(typeof db.insertOne).toBe('function');
    expect(typeof db.gracefulShutdown).toBe('function');
  });

  it('I2: getDb is a singleton — same instance on repeated calls', async () => {
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
  });

  it('I4: closeDb is idempotent — second call does not throw', async () => {
    await closeDb();
    await expect(closeDb()).resolves.not.toThrow();
  });
});

describe.skipIf(hasInfra)('packages/shared/src/db/client.ts (no infra)', () => {
  it('skipped: STRICTDB_URI not set; integration tests not run', () => {
    expect(true).toBe(true);
  });
});
