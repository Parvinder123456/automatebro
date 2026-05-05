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
import { classifyEventIntent, intentGateAllows } from './classifyIntent.js';

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

  // Spec 016 — classify the event intent before automation matching.
  // Idempotent (no-op if already classified). Failure / cap-exceeded
  // returns null intent and the gate is bypassed downstream.
  const classification = await classifyEventIntent(event);
  const eventIntent = classification.intent;

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

    // Spec 016 — intent gate. When trigger.intents is non-empty and
    // the event was classified, only fire if the classified intent is
    // in the trigger's allowed list. Unclassified events bypass the
    // gate (cap-exceeded fallthrough; see spec 016 §3.4).
    if (!intentGateAllows(trigger.intents ?? null, eventIntent)) continue;
    result.matched += 1;

    const responseRow = await db.queryOne<ResponseRecord>('responses', {
      automationId: automation._id,
    } as never);
    if (responseRow === null) continue;

    // Render content. For mode='static' we render the template now;
    // for mode='ai' we store the COMMENT text as placeholder content
    // (so generate-ai-reply can read it) and the AI handler will
    // overwrite it with the AI-generated reply before send-dm fires.
    const isAi = responseRow.mode === 'ai';
    let content: string;
    if (isAi) {
      // Stash the inbound comment for the AI handler to use as input.
      content = commentText;
    } else {
      content = responseRow.template ?? '';
      content = content !== '' ? renderTemplate(content, { firstName: username, username }) : '';
    }

    // ---- DM send ----
    if (content !== '' || isAi) {
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
        aiGenerated: isAi,
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

      if (isAi) {
        await eventsQueue.add('generate-ai-reply', {
          type: 'generate-ai-reply',
          eventId: event._id,
          responseId: responseRow._id,
          sendId,
        });
      } else {
        await eventsQueue.add('send-dm', {
          type: 'send-dm',
          sendId,
          igAccountId: event.igAccountId,
          recipientPsid,
          content,
          automationId: automation._id,
        });
      }
      result.enqueued += 1;
    }

    // ---- Comment reply ----
    const commentReplyText = responseRow.commentReply ?? null;
    const commentId = payload?.change?.value?.id ?? null;
    if (commentReplyText !== null && commentReplyText !== '' && commentId !== null) {
      const renderedReply = renderTemplate(commentReplyText, { firstName: username, username });
      const replySendId = randomUUID();
      const replySend: Send = {
        _id: replySendId,
        tenantId: event.tenantId,
        igAccountId: event.igAccountId,
        automationId: automation._id,
        eventId: event._id,
        recipientPsid,
        kind: 'commentReply',
        content: renderedReply,
        aiGenerated: false,
        status: 'queued',
        metaMessageId: null,
        errorCode: null,
        errorMessage: null,
        attempt: 1,
        queuedAt: new Date(),
        sentAt: null,
        failedAt: null,
      };
      await db.insertOne('sends', replySend as never);

      await eventsQueue.add('send-comment-reply', {
        type: 'send-comment-reply',
        sendId: replySendId,
        igAccountId: event.igAccountId,
        commentId,
        message: renderedReply,
      });
      result.enqueued += 1;
    }
  }

  return result;
}
