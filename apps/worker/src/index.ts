/**
 * AutomateBro worker bootstrap.
 *
 * Spec 001 §10 — worker bootstrap contract.
 *
 * Responsibilities in v0.1:
 *  - Validate env (fail-fast on missing/malformed).
 *  - Warm DB connection.
 *  - Verify Redis reachable.
 *  - Write a heartbeat key to Redis every 30 s (TTL 90 s) so external
 *    monitors can detect a stuck process.
 *  - Shut down cleanly on SIGINT / SIGTERM and on uncaughtException.
 *
 * Spec 006 will add the actual BullMQ Worker (consumer) here.
 */
import { closeDb, getDb } from '@automatebro/shared/db/client';
import { Env } from '@automatebro/shared/env';
import { logger } from '@automatebro/shared/logger';
import { closeQueue, connection } from '@automatebro/shared/queue/queues';

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TTL_SEC = 90;

let heartbeatTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

async function writeHeartbeat(): Promise<void> {
  try {
    await connection.set(HEARTBEAT_KEY, new Date().toISOString(), 'EX', HEARTBEAT_TTL_SEC);
  } catch (err: unknown) {
    logger.warn({ err }, 'heartbeat write failed');
  }
}

async function shutdown(code: number, reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ reason, code }, 'worker shutting down');
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Close queue + Redis first so jobs in-flight don't outlive the DB.
  await closeQueue().catch((err: unknown) => logger.warn({ err }, 'closeQueue error'));
  await closeDb().catch((err: unknown) => logger.warn({ err }, 'closeDb error'));

  logger.info('worker shutdown complete');
  // Pino's default destination (process.stdout) is a synchronous file
  // descriptor on Linux/macOS, so the line above is on disk before we
  // exit. If a future spec adds an async transport (Axiom, file), wrap
  // a `pino.final()` flush around shutdown — see Pino docs.
  process.exit(code);
}

function registerSignalHandlers(): void {
  process.on('SIGINT', () => {
    void shutdown(0, 'SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown(0, 'SIGTERM');
  });
  process.on('uncaughtException', (err: unknown) => {
    logger.error({ err }, 'uncaughtException');
    void shutdown(1, 'uncaughtException');
  });
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'unhandledRejection');
    void shutdown(1, 'unhandledRejection');
  });
}

async function main(): Promise<void> {
  // 1. Validate env (throws ZodError on missing/malformed).
  Env.parse(process.env);

  // 2. Warm DB connection.
  await getDb();

  // 3. Verify Redis reachable.
  await connection.ping();

  // 4. Initial heartbeat + interval.
  await writeHeartbeat();
  heartbeatTimer = setInterval(() => {
    void writeHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // 5. Register signal handlers AFTER successful boot so a failure
  //    during boot exits via the catch handler below, not via shutdown().
  registerSignalHandlers();

  logger.info({ pid: process.pid }, 'worker ready');
}

main().catch((err: unknown) => {
  // Boot failure (env validation, DB connect, Redis ping). Use stderr
  // directly because the structured logger may have suppressed early
  // errors based on level.
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`worker boot failed: ${msg}`);
  process.exit(1);
});
