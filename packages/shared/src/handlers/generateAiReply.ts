/**
 * Spec 008 — generate an AI reply for a queued send.
 *
 * Pre-condition: a `sends` row in 'queued' status with `aiGenerated:
 * true` and a placeholder `content` (set to fallbackTemplate by
 * processCommentEvent). This handler:
 *
 *   1. Loads the send + automation + response rows.
 *   2. Checks aiUsage cap; if over, mark send 'failed' (aiCapExceeded).
 *   3. If OPENAI_API_KEY missing → use fallback template + skip AI.
 *   4. Calls OpenAI chat completion with response.aiPrompt + tone.
 *   5. Runs moderation; if flagged → use fallback template.
 *   6. Updates aiUsage ($inc tokens + cost in paise).
 *   7. Updates the sends row's content with the rendered reply.
 *   8. Enqueues send-dm to actually deliver.
 *
 * If anything goes wrong on the AI path (timeout, 5xx, moderation
 * flag), we fall back to the static template — degrading to "static
 * reply" behaviour rather than failing the user.
 */
import { randomUUID } from 'node:crypto';
import {
  type ChatCompletionInput,
  OpenAiError,
  chatCompletion,
  computeCostPaise,
  moderate,
} from '../adapters/openai.js';
import { getDb } from '../db/client.js';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';
import { eventsQueue } from '../queue/queues.js';
import type { ResponseRecord, Send } from '../types/tenant.js';

// Spec 021 / Phase 3.2 — exported so the unit test can snapshot it.
// The "same language" instruction makes gpt-4o-mini mirror inbound
// Hindi (Devanagari), Hinglish, or English. Other languages → English
// fallback (covers ~95% of the Indian creator market for v1).
export const SYSTEM_PROMPT_BASE =
  "You are a helpful Instagram assistant replying to user comments. Detect the language of the user's last message (English, Hindi written in Devanagari script, Hinglish — Hindi written in Latin script — or other). Reply in the SAME language and script as the user. If the language is none of those or you're unsure, reply in English. Keep replies concise (under 200 characters), warm, and aligned with the brand voice. Never make promises about prices, deals, or product availability you cannot verify. End with a single relevant emoji unless the brand voice indicates otherwise.";

const TONE_HINTS: Record<string, string> = {
  friendly: 'Use a warm, casual tone with simple language.',
  professional: 'Use a polite, professional tone. Avoid slang.',
  playful: 'Use a fun, energetic tone. Light humor allowed.',
};

interface AiUsageRow {
  inputTokens: number;
  outputTokens: number;
  costInr: number;
  cap: number;
}

const DEFAULT_CAP_BY_PLAN: Record<string, number> = {
  free: 10_000, // ₹100/mo in paise
  starter: 50_000, // ₹500/mo
  growth: 200_000, // ₹2,000/mo
  agency: 500_000, // ₹5,000/mo
};

export interface GenerateAiReplyInput {
  eventId: string;
  responseId: string;
  sendId: string;
}

export interface GenerateAiReplyResult {
  status:
    | 'sent-to-send-dm'
    | 'cap-exceeded'
    | 'no-key-fallback'
    | 'moderation-fallback'
    | 'ai-failed-fallback'
    | 'failed';
  costInrAdded?: number;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function loadOrCreateAiUsage(
  tenantId: string,
  plan: string,
): Promise<{ usage: AiUsageRow; created: boolean }> {
  const db = await getDb();
  const month = currentMonthKey();
  const existing = await db.queryOne<AiUsageRow>('aiUsage', {
    tenantId,
    month,
  } as never);
  if (existing !== null) return { usage: existing, created: false };

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
    // Race: another job for the same tenant inserted first. Re-read.
    const reread = await db.queryOne<AiUsageRow>('aiUsage', { tenantId, month } as never);
    if (reread !== null) return { usage: reread, created: false };
  }
  return { usage: fresh, created: true };
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

async function loadTenantPlan(tenantId: string): Promise<string> {
  const db = await getDb();
  const row = await db.queryOne<{ plan: string }>('tenants', { _id: tenantId } as never);
  return row?.plan ?? 'free';
}

async function markSendFailed(
  sendId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  const db = await getDb();
  await db.updateOne(
    'sends',
    { _id: sendId } as never,
    {
      $set: {
        status: 'failed',
        errorCode,
        errorMessage,
        failedAt: new Date(),
      },
    } as never,
  );
}

async function updateSendContent(sendId: string, content: string): Promise<void> {
  const db = await getDb();
  await db.updateOne('sends', { _id: sendId } as never, { $set: { content } } as never);
}

async function enqueueSendDm(send: Send): Promise<void> {
  await eventsQueue.add('send-dm', {
    type: 'send-dm',
    sendId: send._id,
    igAccountId: send.igAccountId,
    recipientPsid: send.recipientPsid,
    content: send.content,
    automationId: send.automationId ?? null,
  });
}

export async function generateAiReply(input: GenerateAiReplyInput): Promise<GenerateAiReplyResult> {
  const db = await getDb();
  const send = await db.queryOne<Send>('sends', { _id: input.sendId } as never);
  if (send === null) {
    return { status: 'failed' };
  }
  if (send.status !== 'queued') {
    // Already handled by another worker / retry. No-op.
    return { status: 'sent-to-send-dm' };
  }

  const responseRow = await db.queryOne<ResponseRecord>('responses', {
    _id: input.responseId,
  } as never);
  if (responseRow === null) {
    await markSendFailed(input.sendId, 'response_missing', 'response row not found');
    return { status: 'failed' };
  }

  if (send.tenantId === undefined || send.tenantId === null) {
    await markSendFailed(input.sendId, 'no_tenant', 'send has no tenantId');
    return { status: 'failed' };
  }

  // Check OpenAI key presence. If missing, skip AI and use fallback.
  const env = loadEnv();
  const apiKey = env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey === '') {
    logger.warn(
      { sendId: input.sendId },
      'generateAiReply: OPENAI_API_KEY missing — using fallback template',
    );
    const fallback = responseRow.fallbackTemplate ?? responseRow.template ?? '';
    if (fallback === '') {
      await markSendFailed(input.sendId, 'no_fallback', 'AI key missing and no fallback template');
      return { status: 'failed' };
    }
    await updateSendContent(input.sendId, fallback);
    await enqueueSendDm({ ...send, content: fallback });
    return { status: 'no-key-fallback' };
  }

  // Cap check — load (or lazy-create) the aiUsage row.
  const plan = await loadTenantPlan(send.tenantId);
  const { usage } = await loadOrCreateAiUsage(send.tenantId, plan);
  if (usage.costInr >= usage.cap) {
    logger.warn(
      { tenantId: send.tenantId, costInr: usage.costInr, cap: usage.cap },
      'generateAiReply: monthly AI cap exceeded',
    );
    await markSendFailed(
      input.sendId,
      'aiCapExceeded',
      `monthly AI cap exceeded (${usage.costInr}/${usage.cap} paise)`,
    );
    return { status: 'cap-exceeded' };
  }

  // Build the prompt.
  const toneHint =
    responseRow.aiTone !== null && responseRow.aiTone !== undefined
      ? (TONE_HINTS[responseRow.aiTone] ?? '')
      : '';
  const customPrompt = responseRow.aiPrompt ?? '';
  const systemPrompt = [SYSTEM_PROMPT_BASE, toneHint, customPrompt]
    .filter((s) => s.length > 0)
    .join('\n\n');
  const userPrompt = `A user just commented on our Instagram post. Their comment is below — write a single short reply DM. Do not reveal you are an AI.\n\nComment: ${send.content || '(no comment text)'}`;

  const chatInput: ChatCompletionInput = {
    systemPrompt,
    userPrompt,
    maxTokens: 200,
    temperature: 0.7,
  };

  // Call OpenAI. On any error, fall back to template.
  let aiContent: string;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await chatCompletion(chatInput, { apiKey });
    aiContent = result.content.trim();
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (err) {
    const isOpenAi = err instanceof OpenAiError;
    logger.error(
      {
        sendId: input.sendId,
        err: err instanceof Error ? err.message : String(err),
        statusCode: isOpenAi ? err.statusCode : undefined,
        retryable: isOpenAi ? err.retryable : undefined,
      },
      'generateAiReply: OpenAI call failed — using fallback',
    );
    const fallback = responseRow.fallbackTemplate ?? responseRow.template ?? '';
    if (fallback === '') {
      await markSendFailed(input.sendId, 'ai_failed', 'AI failed and no fallback template');
      return { status: 'failed' };
    }
    await updateSendContent(input.sendId, fallback);
    await enqueueSendDm({ ...send, content: fallback });
    return { status: 'ai-failed-fallback' };
  }

  // Moderation gate. If flagged, fall back.
  try {
    const mod = await moderate(aiContent, { apiKey });
    if (mod.flagged) {
      logger.warn(
        { sendId: input.sendId, categories: mod.categories },
        'generateAiReply: moderation flagged AI output — using fallback',
      );
      const fallback = responseRow.fallbackTemplate ?? responseRow.template ?? '';
      if (fallback === '') {
        await markSendFailed(
          input.sendId,
          'moderationFlagged',
          `AI output flagged: ${mod.categories.join(',')}`,
        );
        return { status: 'failed' };
      }
      await updateSendContent(input.sendId, fallback);
      await enqueueSendDm({ ...send, content: fallback });
      return { status: 'moderation-fallback' };
    }
  } catch (err) {
    // Moderation failure is non-fatal — log but proceed with the AI
    // content. (Reasoning: a moderation outage shouldn't block all
    // AI replies; the chatCompletion model itself has built-in safety
    // training.)
    logger.warn(
      { sendId: input.sendId, err: err instanceof Error ? err.message : String(err) },
      'generateAiReply: moderation call failed — proceeding with AI output',
    );
  }

  // Track cost + update content + enqueue send-dm.
  const costInr = computeCostPaise(inputTokens, outputTokens);
  await incrementAiUsage(send.tenantId, inputTokens, outputTokens, costInr);
  await updateSendContent(input.sendId, aiContent);
  await enqueueSendDm({ ...send, content: aiContent });

  logger.info(
    {
      sendId: input.sendId,
      tenantId: send.tenantId,
      inputTokens,
      outputTokens,
      costInr,
    },
    'generateAiReply: completed and enqueued send-dm',
  );
  return { status: 'sent-to-send-dm', costInrAdded: costInr };
}
