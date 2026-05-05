/**
 * Spec 016 — AI intent classifier.
 *
 * Called from processCommentEvent + processDmEvent after the event is
 * loaded. Classifies the inbound text into one of four labels and
 * persists the result on `events.intent` + `events.intentConfidence`.
 *
 * Idempotent: if the event already has `intent !== null`, returns the
 * existing value without calling OpenAI. Cheap retry-safety.
 *
 * Cost-aware: skips OpenAI when the tenant's monthly AI cap is exceeded.
 * Returns null in that case; callers treat null as "unclassified" and
 * bypass any intent gate (see spec §3.4).
 */
import { randomUUID } from 'node:crypto';
import { classifyIntent as classifyIntentRaw, computeCostPaise } from '../adapters/openai.js';
import { getDb } from '../db/client.js';
import type { Intent } from '../db/schema.js';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';
import type { EventRecord } from '../types/tenant.js';

interface AiUsageRow {
  inputTokens: number;
  outputTokens: number;
  costInr: number;
  cap: number;
}

const DEFAULT_CAP_BY_PLAN: Record<string, number> = {
  free: 10_000,
  starter: 50_000,
  growth: 200_000,
  agency: 500_000,
};

// Confidence below this threshold gets coerced to 'other' so we don't
// gate automations on shaky labels. Tunable; 0.5 was chosen after
// reading internal classifier-tuning lit — half-confidence is a typical
// "I'm guessing" cliff for gpt-4o-mini-style small classifiers.
const CONFIDENCE_FLOOR = 0.5;

export interface ClassifyIntentResult {
  intent: Intent | null;
  confidence: number | null;
  status:
    | 'classified'
    | 'already-classified'
    | 'cap-exceeded'
    | 'no-key'
    | 'no-text'
    | 'classifier-failed';
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function extractText(event: EventRecord): string {
  const payload = event.payload as
    | {
        change?: { value?: { text?: string } };
        messaging?: { message?: { text?: string } };
      }
    | undefined;
  if (event.kind === 'comment') return payload?.change?.value?.text ?? '';
  if (event.kind === 'message') return payload?.messaging?.message?.text ?? '';
  return '';
}

async function loadOrCreateAiUsage(tenantId: string, plan: string): Promise<AiUsageRow> {
  const db = await getDb();
  const month = currentMonthKey();
  const existing = await db.queryOne<AiUsageRow>('aiUsage', { tenantId, month } as never);
  if (existing !== null) return existing;
  const cap = DEFAULT_CAP_BY_PLAN[plan] ?? DEFAULT_CAP_BY_PLAN.free ?? 10_000;
  const fresh: AiUsageRow & { _id: string; tenantId: string; month: string } = {
    _id: randomUUID(),
    tenantId,
    month,
    inputTokens: 0,
    outputTokens: 0,
    costInr: 0,
    cap,
  };
  try {
    await db.insertOne('aiUsage', fresh as never);
  } catch {
    // Race: another job inserted first. Re-read.
    const reread = await db.queryOne<AiUsageRow>('aiUsage', { tenantId, month } as never);
    if (reread !== null) return reread;
  }
  return fresh;
}

async function loadTenantPlan(tenantId: string): Promise<string> {
  const db = await getDb();
  const row = await db.queryOne<{ plan: string }>('tenants', { _id: tenantId } as never);
  return row?.plan ?? 'free';
}

async function incrementAiUsage(
  tenantId: string,
  inputTokens: number,
  outputTokens: number,
  costInr: number,
): Promise<void> {
  const db = await getDb();
  const month = currentMonthKey();
  await db.updateOne(
    'aiUsage',
    { tenantId, month } as never,
    { $inc: { inputTokens, outputTokens, costInr } } as never,
  );
}

/**
 * Classify the event's text. Persists on the event row. Returns the
 * intent + confidence (or null on any failure / cap-exceeded path).
 *
 * Callers that want to gate on intent should use the returned `intent`
 * directly; callers that don't care can ignore the result.
 */
export async function classifyEventIntent(event: EventRecord): Promise<ClassifyIntentResult> {
  // Idempotent fast path: already classified.
  if (event.intent !== null && event.intent !== undefined) {
    return {
      intent: event.intent,
      confidence: event.intentConfidence ?? null,
      status: 'already-classified',
    };
  }

  if (event.tenantId === null) {
    return { intent: null, confidence: null, status: 'no-text' };
  }

  const text = extractText(event);
  if (text === '') {
    return { intent: null, confidence: null, status: 'no-text' };
  }

  const env = loadEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    logger.info(
      { eventId: event._id },
      'classifyEventIntent: OPENAI_API_KEY unset — skipping classification',
    );
    return { intent: null, confidence: null, status: 'no-key' };
  }

  // Cap check.
  const plan = await loadTenantPlan(event.tenantId);
  const usage = await loadOrCreateAiUsage(event.tenantId, plan);
  if (usage.costInr >= usage.cap) {
    logger.warn(
      { eventId: event._id, tenantId: event.tenantId, costInr: usage.costInr, cap: usage.cap },
      'classifyEventIntent: monthly AI cap exceeded — skipping classification (intent gate will be bypassed)',
    );
    return { intent: null, confidence: null, status: 'cap-exceeded' };
  }

  let result: Awaited<ReturnType<typeof classifyIntentRaw>>;
  try {
    result = await classifyIntentRaw({ text }, { apiKey });
  } catch (err) {
    logger.warn(
      { eventId: event._id, err: err instanceof Error ? err.message : String(err) },
      'classifyEventIntent: classifier failed — leaving event unclassified',
    );
    return { intent: null, confidence: null, status: 'classifier-failed' };
  }

  // Floor low-confidence labels to 'other' to avoid acting on guesses.
  const intent: Intent =
    result.confidence < CONFIDENCE_FLOOR && result.intent !== 'other' ? 'other' : result.intent;

  // Persist on the event row + bump aiUsage.
  const db = await getDb();
  await db.updateOne(
    'events',
    { _id: event._id } as never,
    { $set: { intent, intentConfidence: result.confidence } } as never,
  );

  const costInr = computeCostPaise(result.inputTokens, result.outputTokens);
  await incrementAiUsage(event.tenantId, result.inputTokens, result.outputTokens, costInr);

  logger.info(
    {
      eventId: event._id,
      tenantId: event.tenantId,
      intent,
      confidence: result.confidence,
      costInr,
    },
    'classifyEventIntent: classified',
  );

  return { intent, confidence: result.confidence, status: 'classified' };
}

/**
 * Decide if a trigger's intent gate matches the event's intent.
 *
 * Backwards-compatible: triggers with no intents filter (null or empty)
 * fire on any intent. If the event is unclassified (e.g. cap exceeded),
 * the gate is BYPASSED — we'd rather over-fire than silence a tenant
 * who's relying on keyword matching.
 */
export function intentGateAllows(
  triggerIntents: Intent[] | null | undefined,
  eventIntent: Intent | null | undefined,
): boolean {
  if (triggerIntents === null || triggerIntents === undefined || triggerIntents.length === 0) {
    return true;
  }
  if (eventIntent === null || eventIntent === undefined) {
    return true; // unclassified — bypass the gate (see spec §3.4)
  }
  return triggerIntents.includes(eventIntent);
}
