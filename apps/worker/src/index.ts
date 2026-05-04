import { closeDb, getDb } from '@automatebro/shared/db/client';
import { Env } from '@automatebro/shared/env';
import { logger } from '@automatebro/shared/logger';
import { GLOBAL_WORKER_LIMIT, JobData } from '@automatebro/shared/queue/jobTypes';
import { closeQueue, connection } from '@automatebro/shared/queue/queues';
/**
 * AutomateBro worker bootstrap.
 *
 * Spec 001 §10 — worker bootstrap contract.
 * Spec 006 — adds BullMQ Worker (consumer) with rate-limited dispatch.
 *
 * Responsibilities:
 *  - Validate env (fail-fast on missing/malformed).
 *  - Warm DB connection.
 *  - Verify Redis reachable.
 *  - Write a heartbeat key to Redis every 30 s (TTL 90 s) so external
 *    monitors can detect a stuck process.
 *  - Pull jobs from the `events` queue and dispatch by JobData.type.
 *  - Apply per-igAccountId rate limit (185/hr) via BullMQ's groupKey.
 *  - Shut down cleanly on SIGINT / SIGTERM and on uncaughtException.
 */
import { type Job, Worker } from 'bullmq';
import { generateAiReply } from './jobs/generateAiReply.js';
import { processEvent } from './jobs/processEvent.js';
import { sendDM } from './jobs/sendDM.js';
import { sendCommentReply } from './jobs/sendCommentReply.js';

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TTL_SEC = 90;

let heartbeatTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;
let worker: Worker | null = null;

const QUEUE_NAME = 'events';
const WORKER_CONCURRENCY = 5;

/**
 * Dispatch a job to the right handler based on its discriminated-union
 * `type`. Zod-parses first so handlers can trust the shape.
 */
async function dispatchJob(job: Job): Promise<void> {
  const data = JobData.parse(job.data);
  switch (data.type) {
    case 'process-event':
      return processEvent(data, job);
    case 'send-dm':
      return sendDM(data, job);
    case 'generate-ai-reply':
      return generateAiReply(data, job);
    case 'send-comment-reply':
      return sendCommentReply(data, job);
  }
}

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

  // Close worker first (waits for in-flight jobs up to a timeout) so
  // jobs don't get killed mid-DB-write. Then queue + DB.
  if (worker !== null) {
    await worker.close().catch((err: unknown) => logger.warn({ err }, 'worker close error'));
    worker = null;
  }
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

  // 5. Spawn BullMQ Worker. The `limiter` config caps each igAccount
  //    to 185 jobs/hour via BullMQ's group-keyed rate limiter — jobs
  //    pass `group: { id: igAccountId }` on enqueue.
  worker = new Worker(QUEUE_NAME, dispatchJob, {
    connection,
    concurrency: WORKER_CONCURRENCY,
    // Global ceiling — backstop only. Per-account rate limiting lands
    // in spec 007 inside the sendDM handler (Redis sliding window).
    limiter: {
      max: GLOBAL_WORKER_LIMIT.max,
      duration: GLOBAL_WORKER_LIMIT.durationMs,
    },
  });

  worker.on('completed', (job: Job) => {
    logger.info(
      { jobId: job.id, type: (job.data as { type?: string })?.type, attempts: job.attemptsMade },
      'job completed',
    );
  });
  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error(
      {
        jobId: job?.id,
        type: (job?.data as { type?: string })?.type,
        attempts: job?.attemptsMade,
        err: err.message,
      },
      'job failed',
    );
  });

  // 6. Register signal handlers AFTER successful boot so a failure
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
