/**
 * Spec 007 §3.2 — Redis sliding-window rate limiter (per igAccountId).
 *
 * Cap: PER_ACCOUNT_RATE_LIMIT (185/hour) — 7.5% buffer below Meta's
 * effective ~200/hour ceiling. Implementation: sorted set keyed on
 * `rate:dm:<igAccountId>`. Each attempt:
 *   1. ZREMRANGEBYSCORE to evict entries older than the window
 *   2. ZADD the current attempt with score=now
 *   3. ZCARD to count remaining entries
 *   4. EXPIRE to keep the key from leaking
 * If ZCARD > max, we ROLLBACK the ZADD (ZREM the just-added member)
 * and return false.
 *
 * BullMQ's per-key limiter is Pro-only (spec 006 lessons), so we DIY.
 */
import { randomBytes } from 'node:crypto';
import { PER_ACCOUNT_RATE_LIMIT } from '../queue/jobTypes.js';
import { connection } from '../queue/queues.js';

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  cap: number;
  retryAfterMs: number;
}

export async function checkAndConsumeRate(
  igAccountId: string,
  cap = PER_ACCOUNT_RATE_LIMIT.max,
  windowMs = PER_ACCOUNT_RATE_LIMIT.durationMs,
): Promise<RateLimitResult> {
  const key = `rate:dm:${igAccountId}`;
  const now = Date.now();
  const member = `${now}-${randomBytes(4).toString('hex')}`;

  // Pipeline for fewer round-trips. Operations are independent enough
  // that we tolerate small races (occasional cap+1 send is OK; Meta's
  // real ceiling is ~200, ours is 185 with buffer).
  const pipeline = connection.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);
  const replies = await pipeline.exec();
  if (replies === null) {
    throw new Error('rateLimit: pipeline.exec returned null');
  }
  const cardReply = replies[2];
  const count = typeof cardReply?.[1] === 'number' ? cardReply[1] : Number(cardReply?.[1] ?? 0);

  if (count > cap) {
    // Roll back: we just inserted ourselves above the cap; remove.
    await connection.zrem(key, member).catch(() => undefined);
    // Compute how long until the oldest entry falls outside the window.
    const oldest = await connection.zrange(key, 0, 0, 'WITHSCORES');
    let retryAfterMs = windowMs;
    if (oldest.length >= 2) {
      const oldestScore = Number(oldest[1] ?? '0');
      retryAfterMs = Math.max(0, oldestScore + windowMs - now);
    }
    return { allowed: false, current: count - 1, cap, retryAfterMs };
  }
  return { allowed: true, current: count, cap, retryAfterMs: 0 };
}

/**
 * Test/admin helper: get the current count without consuming. Useful
 * for the UI dashboard ("you've sent 47/185 this hour").
 */
export async function getRateUsage(
  igAccountId: string,
  windowMs = PER_ACCOUNT_RATE_LIMIT.durationMs,
): Promise<number> {
  const key = `rate:dm:${igAccountId}`;
  const now = Date.now();
  await connection.zremrangebyscore(key, 0, now - windowMs);
  return connection.zcard(key);
}
