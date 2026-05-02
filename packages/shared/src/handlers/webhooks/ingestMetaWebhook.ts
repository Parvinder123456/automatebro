/**
 * Spec 005 — ingest a verified Meta webhook payload.
 *
 * Pre-condition: signature has already been verified by the route
 * (this function trusts the raw body). Idempotency via unique
 * constraint on `events.metaEventId`.
 *
 * Returns counts so the route can include them in the 200 response.
 */
import { getDb } from '../../db/client.js';
import { logger } from '../../logger.js';
import { type ParsedEvent, parseWebhookEvents } from '../../meta/eventId.js';

export interface IngestResult {
  parsed: number;
  inserted: number;
  duplicates: number;
  errors: number;
  events: Array<{ _id: string; kind: string; metaEventId: string }>;
}

interface ResolvedEvent extends ParsedEvent {
  igAccountId: string | null;
  tenantId: string | null;
}

async function resolveTenant(event: ParsedEvent): Promise<ResolvedEvent> {
  if (event.igUserId === null) {
    return { ...event, igAccountId: null, tenantId: null };
  }
  const db = await getDb();
  // Lookup by igUserId across all tenants. If a Page is connected by
  // multiple tenants (agency scenario), we'd want the FIRST connected
  // one for now; v1 hits the same igUserId for one tenant only because
  // the unique constraint is (tenantId, igUserId), but multiple tenants
  // CAN share an igUserId. Pick whichever returns first; spec 007 will
  // refine if needed.
  const row = await db
    .queryOne<{ _id: string; tenantId: string }>('igAccounts', {
      igUserId: event.igUserId,
    } as never)
    .catch(() => null);
  return {
    ...event,
    igAccountId: row?._id ?? null,
    tenantId: row?.tenantId ?? null,
  };
}

export async function ingestMetaWebhook(payload: unknown): Promise<IngestResult> {
  const parsed = parseWebhookEvents(payload);
  const result: IngestResult = {
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
    const resolved = await resolveTenant(event);
    try {
      await db.insertOne('events', {
        tenantId: resolved.tenantId,
        metaEventId: resolved.metaEventId,
        kind: resolved.kind,
        igAccountId: resolved.igAccountId,
        payload: resolved.payload,
        signatureVerified: true,
        receivedAt: new Date(),
        processedAt: null,
      } as never);
      result.inserted += 1;
      result.events.push({
        _id: resolved.metaEventId,
        kind: resolved.kind,
        metaEventId: resolved.metaEventId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Postgres unique-violation = duplicate delivery. No-op.
      if (
        message.includes('23505') ||
        message.toLowerCase().includes('duplicate key') ||
        message.toLowerCase().includes('unique')
      ) {
        result.duplicates += 1;
        continue;
      }
      logger.error(
        { err: message, metaEventId: resolved.metaEventId, kind: resolved.kind },
        'ingestMetaWebhook: insert failed (non-duplicate)',
      );
      result.errors += 1;
    }
  }

  return result;
}
