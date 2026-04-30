/**
 * StrictDB client — lazy singleton.
 *
 * Per CLAUDE.md Critical Rule #3: never import native Postgres drivers
 * directly; always go through StrictDB. StrictDB auto-detects the
 * Postgres backend from the `postgresql://` URI scheme.
 *
 * The StrictDB instance is created on first call to getDb(). Subsequent
 * calls return the same Promise (and therefore the same client). This
 * prevents connection-pool exhaustion in long-running processes.
 *
 * closeDb() is idempotent. Workers / API routes wire it into SIGINT /
 * SIGTERM handlers.
 */
import { StrictDB } from 'strictdb';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';

/**
 * Subset of the StrictDB shutdown surface we care about. We do NOT
 * call gracefulShutdown() here because that variant calls
 * process.exit() per CLAUDE.md docs — bad for tests. We probe for a
 * plain close()/disconnect() instead.
 */
type ClosableDb = {
  close?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
};

let dbPromise: Promise<StrictDB> | null = null;

/**
 * Get (or initialise) the singleton StrictDB instance.
 * Throws Zod error if STRICTDB_URI is missing or malformed.
 */
export function getDb(): Promise<StrictDB> {
  if (dbPromise === null) {
    const env = loadEnv();
    dbPromise = StrictDB.create({ uri: env.STRICTDB_URI });
  }
  return dbPromise;
}

/**
 * Close the StrictDB connection. Idempotent — safe to call multiple
 * times and from multiple signal handlers. Best-effort: swallows
 * close-time errors so shutdown never throws.
 */
export async function closeDb(): Promise<void> {
  if (dbPromise === null) return;
  const promise = dbPromise;
  dbPromise = null;
  try {
    const db = await promise;
    const closable = db as unknown as ClosableDb;
    if (typeof closable.close === 'function') {
      await closable.close();
    } else if (typeof closable.disconnect === 'function') {
      await closable.disconnect();
    } else {
      logger.warn(
        'closeDb: StrictDB instance exposes no close()/disconnect() method — connection may leak',
      );
    }
  } catch {
    // Best-effort. Underlying connection state is unrecoverable here.
  }
}

/** Test-only: drop the cached promise without closing the client. */
export function _resetDbCache(): void {
  dbPromise = null;
}
