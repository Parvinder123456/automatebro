/**
 * Spec 026 — Redis sliding-window rate limiter for WhatsApp sends.
 *
 * Mirror of `meta/rateLimit.ts` (the IG 185/hr limiter) using a
 * different key namespace and the WhatsApp tier-1 default cap
 * (1000 conversations / 24h). Configurable per-account via the
 * `whatsappAccounts.dailyConversationCap` field; pass cap explicitly.
 *
 * NOTE: this counts *send attempts*, not *conversations*. WhatsApp's
 * billing model is conversation-based (24h windows opened by templates
 * or inbound messages), so the rate limit is a defence-in-depth
 * primitive — the daily-cap check inside sendWhatsapp is the real
 * billing guardrail.
 */
import { randomBytes } from 'node:crypto';
import { WHATSAPP_TIER1_LIMIT } from '../queue/jobTypes.js';
import { connection } from '../queue/queues.js';

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  cap: number;
  retryAfterMs: number;
}

export async function checkAndConsumeWhatsappRate(
  phoneNumberId: string,
  cap: number = WHATSAPP_TIER1_LIMIT.max,
  windowMs: number = WHATSAPP_TIER1_LIMIT.durationMs,
): Promise<RateLimitResult> {
  const key = `rate:wa:${phoneNumberId}`;
  const now = Date.now();
  const member = `${now}-${randomBytes(4).toString('hex')}`;

  const pipeline = connection.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);
  const replies = await pipeline.exec();
  if (replies === null) {
    throw new Error('whatsapp rateLimit: pipeline.exec returned null');
  }
  const cardReply = replies[2];
  const count = typeof cardReply?.[1] === 'number' ? cardReply[1] : Number(cardReply?.[1] ?? 0);

  if (count > cap) {
    await connection.zrem(key, member).catch(() => undefined);
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
