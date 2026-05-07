/**
 * Spec 026 — ingest a verified WhatsApp webhook payload.
 *
 * Pre-condition: signature has already been verified by the route
 * (this function trusts the raw body). Idempotency via unique
 * constraint on `events.metaEventId`.
 *
 * Resolves tenant by looking up the phone_number_id in
 * `whatsappAccounts`. Multiple tenants sharing one phoneNumberId is
 * impossible (DB unique constraint), so resolution is deterministic.
 *
 * Mirror of ingestMetaWebhook for the WhatsApp domain — structurally
 * the same shape so the route handler can treat both ingest paths
 * uniformly.
 */
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../logger.js';
import {
  type ParsedWhatsappEvent,
  parseWhatsappWebhookEvents,
} from '../../meta/whatsappWebhookParser.js';
import { eventsQueue } from '../../queue/queues.js';

export interface IngestWhatsappResult {
  parsed: number;
  inserted: number;
  duplicates: number;
  errors: number;
  events: Array<{ _id: string; kind: string; metaEventId: string }>;
}

interface ResolvedWhatsappEvent {
  parsed: ParsedWhatsappEvent;
  whatsappAccountId: string | null;
  tenantId: string | null;
}

async function resolveWhatsappTenant(event: ParsedWhatsappEvent): Promise<ResolvedWhatsappEvent> {
  // Template-status events don't have a phoneNumberId — they're scoped
  // to the WABA. Resolve via wabaId instead.
  const db = await getDb();

  if (event.kind === 'whatsappTemplateStatus') {
    const row = await db
      .queryOne<{ _id: string; tenantId: string }>('whatsappAccounts', {
        wabaId: event.wabaId,
      } as never)
      .catch(() => null);
    return {
      parsed: event,
      whatsappAccountId: row?._id ?? null,
      tenantId: row?.tenantId ?? null,
    };
  }

  // Message + status events have a phoneNumberId we can look up.
  const row = await db
    .queryOne<{ _id: string; tenantId: string }>('whatsappAccounts', {
      phoneNumberId: event.phoneNumberId,
    } as never)
    .catch(() => null);
  return {
    parsed: event,
    whatsappAccountId: row?._id ?? null,
    tenantId: row?.tenantId ?? null,
  };
}

export async function ingestWhatsappWebhook(payload: unknown): Promise<IngestWhatsappResult> {
  const parsed = parseWhatsappWebhookEvents(payload);
  const result: IngestWhatsappResult = {
    parsed: parsed.length,
    inserted: 0,
    duplicates: 0,
    errors: 0,
    events: [],
  };

  if (parsed.length === 0) {
    return result;
  }

  const db = await getDb();

  for (const event of parsed) {
    const resolved = await resolveWhatsappTenant(event);
    if (resolved.whatsappAccountId === null) {
      // We received a webhook for a WABA we don't have connected. This
      // can happen briefly during connect/disconnect transitions or if
      // Meta is testing our endpoint. Log + skip — don't insert an
      // unattributed event.
      logger.warn(
        {
          kind: event.kind,
          wabaId: event.wabaId,
          phoneNumberId: event.kind === 'whatsappTemplateStatus' ? null : event.phoneNumberId,
        },
        'ingestWhatsappWebhook: no matching whatsappAccount — dropping',
      );
      continue;
    }

    const eventId = randomUUID();
    try {
      await db.insertOne('events', {
        _id: eventId,
        tenantId: resolved.tenantId,
        metaEventId: event.metaEventId,
        kind: event.kind,
        igAccountId: null,
        whatsappAccountId: resolved.whatsappAccountId,
        payload: event.payload,
        signatureVerified: true,
        receivedAt: new Date(),
        processedAt: null,
      } as never);
      result.inserted += 1;
      result.events.push({
        _id: eventId,
        kind: event.kind,
        metaEventId: event.metaEventId,
      });

      // Enqueue dispatcher. Worker side will branch on event.kind to
      // route to processWhatsappMessageEvent / handleWhatsappStatus /
      // handleTemplateStatusUpdate (lands in Slab 3+).
      try {
        await eventsQueue.add('process-event', { type: 'process-event', eventId });
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err), eventId },
          'ingestWhatsappWebhook: queue.add failed — event persisted but not queued',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Postgres unique-violation on (metaEventId) = duplicate delivery.
      if (
        message.includes('23505') ||
        message.toLowerCase().includes('duplicate key') ||
        message.toLowerCase().includes('unique')
      ) {
        result.duplicates += 1;
        continue;
      }
      logger.error(
        { err: message, metaEventId: event.metaEventId, kind: event.kind },
        'ingestWhatsappWebhook: insert failed (non-duplicate)',
      );
      result.errors += 1;
    }
  }

  return result;
}
