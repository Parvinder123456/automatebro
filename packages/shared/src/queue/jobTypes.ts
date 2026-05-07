/**
 * Spec 006 — discriminated-union job payloads for the `events` queue.
 *
 * One queue carries every job type. Workers switch on `data.type` to
 * dispatch. Each variant has its own Zod schema; payloads are parsed
 * before any side-effecting work.
 *
 * v1 implementations:
 *   - process-event: implemented in spec 006 (this spec)
 *   - send-dm: stub in spec 006, real in spec 007
 *   - generate-ai-reply: stub in spec 006, real in spec 008
 *
 * Spec 009 note: lead capture is handled inline inside processEvent
 * (branch on event.kind === 'message') rather than as a separate
 * job type. See docs/specs/009-lead-capture.md §3.1.
 */
import { z } from 'zod';

export const ProcessEventJob = z.object({
  type: z.literal('process-event'),
  eventId: z.string().uuid(),
});

export const SendDMJob = z.object({
  type: z.literal('send-dm'),
  sendId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  recipientPsid: z.string().min(1),
  content: z.string().min(1),
  automationId: z.string().uuid().nullable(),
});

export const GenerateAiReplyJob = z.object({
  type: z.literal('generate-ai-reply'),
  eventId: z.string().uuid(),
  responseId: z.string().uuid(),
  // Spec 008 — also carries the queued sends row id so the handler
  // can update content + enqueue send-dm without re-deriving.
  sendId: z.string().uuid(),
});

export const SendCommentReplyJob = z.object({
  type: z.literal('send-comment-reply'),
  sendId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  commentId: z.string().min(1),
  message: z.string().min(1),
});

// Spec 026 — WhatsApp send job. The handler re-checks service window
// + opt-out + daily cap + rate limit + template approval at runtime,
// since the queued state may diverge from what processEvent saw.
export const SendWhatsappJob = z.object({
  type: z.literal('send-whatsapp'),
  sendId: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
  /** E.164 recipient phone. */
  recipientPhone: z.string().min(1),
  /** Pre-rendered freeform body. Empty string allowed if template is set. */
  content: z.string(),
  automationId: z.string().uuid().nullable(),
});

export const JobData = z.discriminatedUnion('type', [
  ProcessEventJob,
  SendDMJob,
  GenerateAiReplyJob,
  SendCommentReplyJob,
  SendWhatsappJob,
]);

export type JobData = z.infer<typeof JobData>;
export type ProcessEventJobType = z.infer<typeof ProcessEventJob>;
export type SendDMJobType = z.infer<typeof SendDMJob>;
export type GenerateAiReplyJobType = z.infer<typeof GenerateAiReplyJob>;
export type SendCommentReplyJobType = z.infer<typeof SendCommentReplyJob>;
export type SendWhatsappJobType = z.infer<typeof SendWhatsappJob>;

// Spec 026 — per-WABA rate limit. Default tier-1 is 1000 conversations
// per 24h. We track conversations approximately via per-recipient sliding
// windows (same primitive as IG's 185/hr limiter, different cap and
// duration).
export const WHATSAPP_TIER1_LIMIT = {
  max: 1000,
  durationMs: 24 * 60 * 60 * 1000,
} as const;

/**
 * Per-IG-account rate limit (Meta's effective ceiling is ~200 DMs/hour;
 * we run at 185 with a 7.5% buffer). Enforced inside the sendDM
 * handler via a Redis sliding-window sorted set (spec 007) — BullMQ's
 * `groupKey` per-key limiter is a Pro-only feature.
 */
export const PER_ACCOUNT_RATE_LIMIT = {
  max: 185,
  durationMs: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Global worker limiter — a generous backstop applied via BullMQ's
 * Worker `limiter` config. Across ALL job types and ALL accounts,
 * we cap at 1000 jobs/hour to prevent runaway Redis or API thrashing
 * if per-account logic fails. Real per-account limiting is in spec 007.
 */
export const GLOBAL_WORKER_LIMIT = {
  max: 1000,
  durationMs: 60 * 60 * 1000,
} as const;
