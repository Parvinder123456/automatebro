/**
 * BullMQ queue + ioredis connection.
 *
 * Per engineering plan §3 / §9: ONE queue called `events` carries every
 * job type as a discriminated union. Per-IG-account rate limiting is
 * configured here (BullMQ's built-in limiter). The Worker (consumer)
 * lives in apps/worker/src/index.ts; this file only exports the Queue
 * (producer) and the underlying Redis connection.
 *
 * Connection note: ioredis is configured with `lazyConnect: true` so
 * that importing this module does not actually open a TCP connection.
 * That means tests with no REDIS_URL still load the module cleanly;
 * the connection only opens on the first command (e.g. ping(), add(),
 * etc.).
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Lazy module-load: read REDIS_URL with a fallback so a malformed
 * env doesn't fail at import time. Tests that genuinely need Redis
 * gate themselves on `process.env.REDIS_URL` via describe.skipIf.
 */
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Shared ioredis connection used by the Queue and the Worker. */
export const connection: Redis = new Redis(redisUrl, {
  // BullMQ requires this so ioredis doesn't retry forever on its own
  // — BullMQ has its own retry semantics layered on top.
  maxRetriesPerRequest: null,
  // Open the TCP connection only on first command.
  lazyConnect: true,
});

/**
 * The single 'events' queue. Per engineering plan §9, the per-IG-account
 * 185/hr rate limit is enforced on the Worker side (not here), so the
 * Queue itself has no producer-side limiter.
 */
export const eventsQueue: Queue = new Queue('events', { connection });

/**
 * Close the queue + connection. Idempotent; best-effort.
 */
export async function closeQueue(): Promise<void> {
  try {
    await eventsQueue.close();
  } catch {
    // best-effort
  }
  try {
    await connection.quit();
  } catch {
    // best-effort
  }
}
