/**
 * Spec 015 — given a verified Meta `message` event row, match it against
 * the tenant's active DM-trigger automations and enqueue a send-dm
 * (or generate-ai-reply) job per match.
 *
 * Mirror of `processCommentEvent` for `kind='message'` events. Differences:
 *  - Reads payload from `messaging.message.text` / `messaging.sender.id`
 *    instead of `change.value.text` / `change.value.from.id`
 *  - Filters automations on `trigger: 'dm'` instead of `'comment'`
 *  - Skips post-id scoping (DMs aren't post-bound)
 *  - Skips the comment-reply branch (no public comment to reply to)
 *
 * Called by the worker's processEvent dispatcher when event.kind ===
 * 'message', in parallel with `captureLead`. The dispatcher sets
 * processedAt AFTER both return; if either throws, BullMQ retries the
 * whole job. Lead-capture is idempotent on (tenantId, igAccountId,
 * igUserId) so re-running is safe.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { eventsQueue } from '../queue/queues.js';
import type { Automation, EventRecord, ResponseRecord, Send, Trigger } from '../types/tenant.js';
import { classifyEventIntent, intentGateAllows } from './classifyIntent.js';

export interface ProcessDmResult {
  matched: number;
  enqueued: number;
}

interface MessagePayload {
  entry?: { id?: string; time?: number };
  messaging?: {
    sender?: { id?: string; username?: string };
    recipient?: { id?: string };
    message?: { mid?: string; text?: string };
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

export async function processDmEvent(event: EventRecord): Promise<ProcessDmResult> {
  const result: ProcessDmResult = { matched: 0, enqueued: 0 };

  if (event.tenantId === null || event.igAccountId === null) {
    logger.info(
      { eventId: event._id },
      'processDmEvent: event has no tenant/igAccount — likely orphan, skipping',
    );
    return result;
  }

  const payload = event.payload as MessagePayload;
  const messageText = payload?.messaging?.message?.text ?? '';
  const recipientPsid = payload?.messaging?.sender?.id ?? null;
  const username = payload?.messaging?.sender?.username ?? '';

  if (messageText === '' || recipientPsid === null) {
    logger.info(
      { eventId: event._id },
      'processDmEvent: payload missing message text or sender id — likely a reaction or non-text DM',
    );
    return result;
  }

  const db = await getDb();

  // Spec 015 retry-dedupe: parallel dispatch means captureLead can
  // succeed while processDmEvent throws partway through. BullMQ retry
  // re-runs the whole job. To prevent duplicate DM sends, we check if
  // a `sends` row already exists for this eventId — if so, this invocation
  // is a retry for an event we already partially-processed; bail out.
  // Trade-off: if a tenant has multiple dm-trigger automations and only
  // SOME enqueued sends on the first run before failing, the remaining
  // ones will not fire on retry. Acceptable: comment-trigger has the same
  // limitation and it's better than duplicate DMs.
  const existingSendCount = await db.count('sends', { eventId: event._id } as never);
  if (existingSendCount > 0) {
    logger.info(
      { eventId: event._id, existingSendCount },
      'processDmEvent: sends already exist for this event — likely a retry, skipping',
    );
    return result;
  }

  // Spec 016 — classify the event intent before automation matching.
  // Idempotent (no-op if already classified). Failure / cap-exceeded
  // returns null intent and the gate is bypassed downstream.
  const classification = await classifyEventIntent(event);
  const eventIntent = classification.intent;

  // Find active DM-trigger automations for this igAccount.
  const automations = await db.queryMany<Automation>(
    'automations',
    {
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
      status: 'active',
      trigger: 'dm',
    } as never,
    { limit: 100 },
  );

  for (const automation of automations) {
    const trigger = await db.queryOne<Trigger>('triggers', {
      automationId: automation._id,
    } as never);
    if (trigger === null) continue;

    // postIds scoping intentionally NOT applied for DMs — they aren't
    // post-bound. Even if a tenant configured postIds on a dm-trigger
    // automation (legal in the schema), it's ignored here.

    // Keyword match — empty keywords array means "fire on any DM"
    const hit =
      trigger.keywords.length === 0 ||
      trigger.keywords.some((kw) => matchesKeyword(messageText, kw, trigger.matchMode));
    if (!hit) continue;

    // Spec 016 — intent gate. See processCommentEvent for the same
    // pattern. Unclassified events bypass the gate (spec 016 §3.4).
    if (!intentGateAllows(trigger.intents ?? null, eventIntent)) continue;
    result.matched += 1;

    const responseRow = await db.queryOne<ResponseRecord>('responses', {
      automationId: automation._id,
    } as never);
    if (responseRow === null) continue;

    // Render content. AI mode stashes the inbound DM text for the
    // generate-ai-reply handler to use as input; the AI handler will
    // overwrite content with the AI-generated reply before send-dm.
    const isAi = responseRow.mode === 'ai';
    let content: string;
    if (isAi) {
      content = messageText;
    } else {
      content = responseRow.template ?? '';
      content = content !== '' ? renderTemplate(content, { firstName: username, username }) : '';
    }

    if (content === '' && !isAi) continue;

    // Create a sends row in 'queued' status. The send-dm handler updates
    // it to sent/failed/rateLimited/outsideWindow.
    const sendId = randomUUID();
    const send: Send = {
      _id: sendId,
      tenantId: event.tenantId,
      channel: 'instagram',
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

    // No comment-reply branch — DMs aren't public comments. If the
    // tenant configured `responses.commentReply` on a dm-trigger
    // automation, we ignore it.
  }

  return result;
}
