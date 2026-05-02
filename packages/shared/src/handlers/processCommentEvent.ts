/**
 * Spec 007 — given a verified Meta comment-event row, match it against
 * the tenant's active automations and enqueue a send-dm job per match.
 *
 * Called by the worker's processEvent dispatcher when event.kind ===
 * 'comment'. The processedAt timestamp is set by the dispatcher AFTER
 * this returns successfully; if we throw, the job retries.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { eventsQueue } from '../queue/queues.js';
import type { Automation, EventRecord, ResponseRecord, Send, Trigger } from '../types/tenant.js';

export interface ProcessCommentResult {
  matched: number;
  enqueued: number;
}

interface CommentPayload {
  entry?: { id?: string; time?: number };
  change?: {
    field?: string;
    value?: {
      id?: string;
      text?: string;
      from?: { id?: string; username?: string };
      media?: { id?: string };
    };
  };
}

function matchesKeyword(text: string, keyword: string, mode: Trigger['matchMode']): boolean {
  const t = text.toLowerCase();
  const k = keyword.toLowerCase();
  switch (mode) {
    case 'exact':
      return t.trim() === k;
    case 'startsWith':
      return t.startsWith(k);
    default:
      return t.includes(k);
  }
}

function renderTemplate(template: string, vars: { firstName: string; username: string }): string {
  return template.replaceAll('{firstName}', vars.firstName).replaceAll('{username}', vars.username);
}

export async function processCommentEvent(event: EventRecord): Promise<ProcessCommentResult> {
  const result: ProcessCommentResult = { matched: 0, enqueued: 0 };

  if (event.tenantId === null || event.igAccountId === null) {
    logger.info(
      { eventId: event._id },
      'processCommentEvent: event has no tenant/igAccount — likely orphan, skipping',
    );
    return result;
  }

  const payload = event.payload as CommentPayload;
  const commentText = payload?.change?.value?.text ?? '';
  const recipientPsid = payload?.change?.value?.from?.id ?? null;
  const username = payload?.change?.value?.from?.username ?? '';
  const postId = payload?.change?.value?.media?.id ?? null;

  if (commentText === '' || recipientPsid === null) {
    logger.warn(
      { eventId: event._id },
      'processCommentEvent: payload missing comment text or sender id',
    );
    return result;
  }

  const db = await getDb();

  // Find active comment-trigger automations for this igAccount.
  const automations = await db.queryMany<Automation>(
    'automations',
    {
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
      status: 'active',
      trigger: 'comment',
    } as never,
    { limit: 100 },
  );

  for (const automation of automations) {
    const trigger = await db.queryOne<Trigger>('triggers', {
      automationId: automation._id,
    } as never);
    if (trigger === null) continue;

    // Optional post-id scoping
    if (trigger.postIds && trigger.postIds.length > 0 && postId !== null) {
      if (!trigger.postIds.includes(postId)) continue;
    }

    // Keyword match (any keyword)
    const hit = trigger.keywords.some((kw) => matchesKeyword(commentText, kw, trigger.matchMode));
    if (!hit) continue;
    result.matched += 1;

    const responseRow = await db.queryOne<ResponseRecord>('responses', {
      automationId: automation._id,
    } as never);
    if (responseRow === null) continue;

    // Render content. AI variants are deferred to spec 008 — for v1
    // we use the static template; if mode='ai', we use fallbackTemplate
    // as a placeholder until spec 008 wires OpenAI.
    let content: string;
    if (responseRow.mode === 'static') {
      content = responseRow.template ?? '';
    } else {
      content = responseRow.fallbackTemplate ?? responseRow.template ?? '';
    }
    if (content === '') continue;
    content = renderTemplate(content, { firstName: username, username });

    // Create a sends row in 'queued' status. The send-dm handler
    // updates it to sent/failed/rateLimited/outsideWindow.
    const sendId = randomUUID();
    const send: Send = {
      _id: sendId,
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
      automationId: automation._id,
      eventId: event._id,
      recipientPsid,
      kind: 'dm',
      content,
      aiGenerated: responseRow.mode === 'ai',
      status: 'queued',
      metaMessageId: null,
      errorCode: null,
      errorMessage: null,
      attempt: 1,
      queuedAt: new Date(),
      sentAt: null,
      failedAt: null,
    };
    await db.insertOne('sends', send as never);

    await eventsQueue.add('send-dm', {
      type: 'send-dm',
      sendId,
      igAccountId: event.igAccountId,
      recipientPsid,
      content,
      automationId: automation._id,
    });
    result.enqueued += 1;
  }

  return result;
}
