/**
 * Spec 018 / Phase 1.4 — given a verified Meta `storyReply` event row,
 * match it against the tenant's active storyReply-trigger automations
 * and enqueue a send-dm job per match.
 *
 * Mirror of `processDmEvent` for `kind='storyReply'` events. Differences:
 *  - Filters automations on `trigger: 'storyReply'`
 *  - Reads the original story reference from `message.reply_to.story.id`
 *    (stored in the payload but not currently used for matching — future
 *    spec could add per-story scoping similar to per-post scoping for
 *    comment triggers)
 *
 * Status — gated on Meta App Review:
 *  - Webhook subscription does NOT currently include `messages` field
 *    (per CLAUDE.md §13.4 lessons), so storyReply events are NOT arriving
 *    in production yet.
 *  - When Meta grants `instagram_manage_messages`, add `messages` to
 *    `WEBHOOK_FIELDS` in `connectIgAccount.ts` and re-subscribe existing
 *    accounts. The handler is ready; the dispatcher branch is wired.
 *  - Until then this handler runs only against synthetic test events.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { eventsQueue } from '../queue/queues.js';
import type { Automation, EventRecord, ResponseRecord, Send, Trigger } from '../types/tenant.js';
import { classifyEventIntent, intentGateAllows } from './classifyIntent.js';

export interface ProcessStoryReplyResult {
  matched: number;
  enqueued: number;
}

interface StoryReplyPayload {
  entry?: { id?: string; time?: number };
  messaging?: {
    sender?: { id?: string; username?: string };
    recipient?: { id?: string };
    message?: {
      mid?: string;
      text?: string;
      reply_to?: { story?: { id?: string; url?: string } };
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

export async function processStoryReplyEvent(event: EventRecord): Promise<ProcessStoryReplyResult> {
  const result: ProcessStoryReplyResult = { matched: 0, enqueued: 0 };

  if (event.tenantId === null || event.igAccountId === null) {
    logger.info(
      { eventId: event._id },
      'processStoryReplyEvent: event has no tenant/igAccount — likely orphan, skipping',
    );
    return result;
  }

  const payload = event.payload as StoryReplyPayload;
  const messageText = payload?.messaging?.message?.text ?? '';
  const recipientPsid = payload?.messaging?.sender?.id ?? null;
  const username = payload?.messaging?.sender?.username ?? '';
  const storyId = payload?.messaging?.message?.reply_to?.story?.id ?? null;

  if (messageText === '' || recipientPsid === null) {
    logger.info(
      { eventId: event._id },
      'processStoryReplyEvent: payload missing reply text or sender id',
    );
    return result;
  }

  const db = await getDb();

  // Retry-dedupe (same pattern as processDmEvent — see CLAUDE.md spec 015 lesson)
  const existingSendCount = await db.count('sends', { eventId: event._id } as never);
  if (existingSendCount > 0) {
    logger.info(
      { eventId: event._id, existingSendCount },
      'processStoryReplyEvent: sends already exist for this event — likely a retry, skipping',
    );
    return result;
  }

  // Classify intent (idempotent; reuses any cached classification on the event)
  const classification = await classifyEventIntent(event);
  const eventIntent = classification.intent;

  // Find active storyReply-trigger automations.
  const automations = await db.queryMany<Automation>(
    'automations',
    {
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
      status: 'active',
      trigger: 'storyReply',
    } as never,
    { limit: 100 },
  );

  for (const automation of automations) {
    const trigger = await db.queryOne<Trigger>('triggers', {
      automationId: automation._id,
    } as never);
    if (trigger === null) continue;

    // Future: per-story scoping similar to per-post scoping. For v1 we
    // ignore trigger.postIds on storyReply automations (stories aren't
    // posts). When story-id-scoping is needed, add a `triggers.storyIds`
    // column and gate here.
    void storyId;

    // Keyword match (any keyword)
    const hit = trigger.keywords.some((kw) => matchesKeyword(messageText, kw, trigger.matchMode));
    if (!hit) continue;

    // Intent gate (spec 016)
    if (!intentGateAllows(trigger.intents ?? null, eventIntent)) continue;
    result.matched += 1;

    const responseRow = await db.queryOne<ResponseRecord>('responses', {
      automationId: automation._id,
    } as never);
    if (responseRow === null) continue;

    const isAi = responseRow.mode === 'ai';
    let content: string;
    if (isAi) {
      content = messageText;
    } else {
      content = responseRow.template ?? '';
      content = content !== '' ? renderTemplate(content, { firstName: username, username }) : '';
    }
    if (content === '' && !isAi) continue;

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

  return result;
}
