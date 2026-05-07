/**
 * Spec 026 — given a verified WhatsApp `messages` event, match it
 * against the tenant's active whatsappMessage-trigger automations and
 * enqueue a send-whatsapp job per match.
 *
 * Mirror of `processDmEvent` for the WhatsApp domain. Differences:
 *  - Filters automations on `trigger: 'whatsappMessage'` and scopes by
 *    `whatsappAccountId` instead of `igAccountId`.
 *  - Reads payload from the WA-shaped `messages` array element, not
 *    IG's `messaging.message.text`.
 *  - Enqueues `send-whatsapp` job, not `send-dm`.
 *  - Updates the lead's `lastWhatsappInboundAt` for service-window math.
 *  - Detects STOP keywords and records opt-out before any reply.
 *
 * Called by the worker's processEvent dispatcher when event.kind ===
 * 'whatsappMessage'.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { eventsQueue } from '../queue/queues.js';
import type {
  Automation,
  EventRecord,
  Lead,
  ResponseRecord,
  Send,
  Trigger,
} from '../types/tenant.js';
import { isStopKeyword } from '../whatsapp/stopKeywords.js';

export interface ProcessWhatsappResult {
  matched: number;
  enqueued: number;
  optedOut: boolean;
}

interface WaMessagePayload {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
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

/**
 * Upsert lead + update lastWhatsappInboundAt + record opt-in. Returns the
 * lead row so subsequent logic can read identity / opt-out state.
 */
async function upsertLeadOnInbound(
  event: EventRecord,
  fromPhone: string,
  contactName: string | null,
): Promise<Lead | null> {
  if (event.tenantId === null) return null;
  const db = await getDb();
  const now = new Date();

  // 1. Look up existing lead by (tenantId, whatsappPhone).
  const existing = await db
    .queryOne<Lead>('leads', {
      tenantId: event.tenantId,
      whatsappPhone: fromPhone,
    } as never)
    .catch(() => null);

  if (existing !== null) {
    // Refresh inbound timestamp + contact name (if Meta sent one).
    await db.updateOne('leads', { _id: existing._id }, {
      $set: {
        lastSeenAt: now,
        lastWhatsappInboundAt: now,
        ...(contactName !== null && contactName.length > 0
          ? { igUsername: existing.igUsername ?? contactName }
          : {}),
      },
    } as never);
    return { ...existing, lastWhatsappInboundAt: now, lastSeenAt: now };
  }

  // 2. New WA-only lead.
  const id = randomUUID();
  const lead: Lead = {
    _id: id,
    tenantId: event.tenantId,
    igAccountId: null,
    igUserId: null,
    igUsername: contactName,
    email: null,
    phone: fromPhone,
    whatsappPhone: fromPhone,
    whatsappAccountId: event.whatsappAccountId ?? null,
    whatsappOptInAt: now, // Inbound message = implicit opt-in per Meta policy.
    whatsappOptOutAt: null,
    lastWhatsappInboundAt: now,
    lastTemplateConversationAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
    tags: [],
    attributedAutomationId: null,
  };
  try {
    await db.insertOne('leads', lead as never);

    // Record the opt-in event for the audit log.
    if (event.whatsappAccountId !== null && event.whatsappAccountId !== undefined) {
      await db.insertOne('whatsappOptInLog', {
        _id: randomUUID(),
        tenantId: event.tenantId,
        whatsappAccountId: event.whatsappAccountId,
        phone: fromPhone,
        action: 'optIn',
        source: 'whatsapp_inbound',
        evidence: event.metaEventId,
        recordedAt: now,
      } as never);
    }
    return lead;
  } catch (err) {
    // Race: two webhooks for the same phone landed simultaneously. Re-read.
    const reread = await db
      .queryOne<Lead>('leads', {
        tenantId: event.tenantId,
        whatsappPhone: fromPhone,
      } as never)
      .catch(() => null);
    if (reread === null) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), fromPhone },
        'upsertLeadOnInbound: insert failed AND re-read returned null',
      );
      return null;
    }
    return reread;
  }
}

/**
 * Record opt-out for STOP messages. Updates lead + appends audit log.
 */
async function recordOptOut(event: EventRecord, lead: Lead, fromPhone: string): Promise<void> {
  if (
    event.tenantId === null ||
    event.whatsappAccountId === null ||
    event.whatsappAccountId === undefined
  ) {
    return;
  }
  const db = await getDb();
  const now = new Date();
  await db.updateOne('leads', { _id: lead._id }, { $set: { whatsappOptOutAt: now } } as never);
  await db.insertOne('whatsappOptInLog', {
    _id: randomUUID(),
    tenantId: event.tenantId,
    whatsappAccountId: event.whatsappAccountId,
    phone: fromPhone,
    action: 'optOut',
    source: 'stop_keyword',
    evidence: event.metaEventId,
    recordedAt: now,
  } as never);
}

export async function processWhatsappMessageEvent(
  event: EventRecord,
): Promise<ProcessWhatsappResult> {
  const result: ProcessWhatsappResult = { matched: 0, enqueued: 0, optedOut: false };

  if (
    event.tenantId === null ||
    event.whatsappAccountId === null ||
    event.whatsappAccountId === undefined
  ) {
    logger.info(
      { eventId: event._id },
      'processWhatsappMessageEvent: event has no tenant/whatsappAccount — skipping',
    );
    return result;
  }

  // Pull the inbound message data out of the parser's stashed payload.
  const payload = event.payload as WaMessagePayload;
  const fromPhone = payload?.from ?? '';
  const messageType = payload?.type ?? '';
  const messageText = payload?.text?.body ?? '';
  const contactName: string | null = null; // contactName lives at parse time, not in payload

  if (fromPhone === '') {
    logger.info(
      { eventId: event._id },
      'processWhatsappMessageEvent: payload missing `from` — skipping',
    );
    return result;
  }

  // 1. Lead upsert + inbound timestamp refresh.
  const lead = await upsertLeadOnInbound(event, fromPhone, contactName);
  if (lead === null) return result;

  // 2. STOP keyword detection → record opt-out + skip automation matching.
  if (messageType === 'text' && isStopKeyword(messageText)) {
    await recordOptOut(event, lead, fromPhone);
    result.optedOut = true;
    return result;
  }

  // 3. Skip matching for non-text messages in v1 (images, voice, location).
  //    Future: media-event triggers, transcription-based intent detection.
  if (messageType !== 'text' || messageText === '') {
    return result;
  }

  // 4. Retry-dedupe per spec 015 lessons — if sends already exist for
  //    this event, this is a retry; bail.
  const db = await getDb();
  const existingSendCount = await db.count('sends', { eventId: event._id } as never);
  if (existingSendCount > 0) {
    logger.info(
      { eventId: event._id, existingSendCount },
      'processWhatsappMessageEvent: sends already exist — likely retry, skipping',
    );
    return result;
  }

  // 5. Find active WA-trigger automations for this account.
  const automations = await db.queryMany<Automation>(
    'automations',
    {
      tenantId: event.tenantId,
      whatsappAccountId: event.whatsappAccountId,
      status: 'active',
      trigger: 'whatsappMessage',
    } as never,
    { limit: 100 },
  );

  for (const automation of automations) {
    const trigger = await db.queryOne<Trigger>('triggers', {
      automationId: automation._id,
    } as never);
    if (trigger === null) continue;

    const hit =
      trigger.keywords.length === 0 ||
      trigger.keywords.some((kw) => matchesKeyword(messageText, kw, trigger.matchMode));
    if (!hit) continue;
    result.matched += 1;

    const responseRow = await db.queryOne<ResponseRecord>('responses', {
      automationId: automation._id,
    } as never);
    if (responseRow === null) continue;

    const username = lead.igUsername ?? '';
    const isAi = responseRow.mode === 'ai';
    let content: string;
    if (isAi) {
      content = messageText;
    } else {
      content = responseRow.template ?? '';
      content = content !== '' ? renderTemplate(content, { firstName: username, username }) : '';
    }
    if (content === '' && !isAi && responseRow.whatsappTemplateId === null) continue;

    // Decide kind at queue time. The send-whatsapp job re-checks the
    // service window — even if we say 'whatsappFreeform' here, the job
    // can downgrade to template (or fail with outsideWindow) at send.
    const sendKind: Send['kind'] =
      responseRow.whatsappTemplateId !== null && responseRow.whatsappTemplateId !== undefined
        ? 'whatsappTemplate'
        : 'whatsappFreeform';

    const sendId = randomUUID();
    const send: Send = {
      _id: sendId,
      tenantId: event.tenantId,
      channel: 'whatsapp',
      igAccountId: null,
      whatsappAccountId: event.whatsappAccountId,
      automationId: automation._id,
      eventId: event._id,
      recipientPsid: null,
      recipientPhone: fromPhone,
      kind: sendKind,
      whatsappTemplateId: responseRow.whatsappTemplateId ?? null,
      whatsappTemplateName: null,
      whatsappTemplateLanguage: null,
      whatsappTemplateParams: null,
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
      // Reuse generate-ai-reply job — it produces text content that
      // sendWhatsapp will treat as the freeform body.
      await eventsQueue.add('generate-ai-reply', {
        type: 'generate-ai-reply',
        eventId: event._id,
        responseId: responseRow._id,
        sendId,
      });
    } else {
      await eventsQueue.add('send-whatsapp', {
        type: 'send-whatsapp',
        sendId,
        whatsappAccountId: event.whatsappAccountId,
        recipientPhone: fromPhone,
        content,
        automationId: automation._id,
      });
    }
    result.enqueued += 1;
  }

  return result;
}
