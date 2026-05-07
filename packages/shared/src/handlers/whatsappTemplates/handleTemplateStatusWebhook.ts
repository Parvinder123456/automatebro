/**
 * Spec 026 — apply a Meta template-status webhook to our local row.
 *
 * Called by the worker's processEvent dispatcher when event.kind ===
 * 'whatsappTemplateStatus'. The parser stashes the relevant fields in
 * the event payload; we look up our local template row by metaTemplateId
 * and update status + timestamp.
 *
 * Meta event values (per webhook docs):
 *   APPROVED, REJECTED, PAUSED, DISABLED, FLAGGED, REINSTATED
 *
 * We map:
 *   APPROVED   → 'approved'  + approvedAt
 *   REJECTED   → 'rejected'  + rejectedAt + rejectionReason
 *   PAUSED     → 'paused'    + pausedAt   (Meta paused due to quality)
 *   DISABLED   → 'disabled'  (we treat same as REJECTED for sending)
 *   FLAGGED    → 'paused'    (FLAGGED is a soft-pause warning)
 *   REINSTATED → 'approved'  (Meta un-paused)
 */
import { getDb } from '../../db/client.js';
import { logger } from '../../logger.js';
import type { EventRecord, WhatsappTemplate, WhatsappTemplateStatus } from '../../types/tenant.js';

interface TemplateStatusPayload {
  event?: string;
  message_template_id?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

function mapStatus(metaEvent: string): WhatsappTemplateStatus | null {
  switch (metaEvent) {
    case 'APPROVED':
    case 'REINSTATED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
    case 'FLAGGED':
      return 'paused';
    case 'DISABLED':
      return 'disabled';
    default:
      return null;
  }
}

export interface HandleTemplateStatusResult {
  matched: boolean;
  newStatus: WhatsappTemplateStatus | null;
}

export async function handleWhatsappTemplateStatusEvent(
  event: EventRecord,
): Promise<HandleTemplateStatusResult> {
  const payload = event.payload as TemplateStatusPayload;
  const metaTemplateId = payload?.message_template_id;
  const metaEvent = payload?.event ?? '';

  if (metaTemplateId === undefined || metaTemplateId.length === 0) {
    logger.warn(
      { eventId: event._id },
      'handleWhatsappTemplateStatusEvent: missing message_template_id',
    );
    return { matched: false, newStatus: null };
  }

  const newStatus = mapStatus(metaEvent);
  if (newStatus === null) {
    logger.info(
      { eventId: event._id, metaEvent },
      'handleWhatsappTemplateStatusEvent: unknown Meta event — skipping',
    );
    return { matched: false, newStatus: null };
  }

  const db = await getDb();
  const row = await db
    .queryOne<WhatsappTemplate>('whatsappTemplates', { metaTemplateId } as never)
    .catch(() => null);
  if (row === null) {
    logger.info(
      { eventId: event._id, metaTemplateId, metaEvent },
      'handleWhatsappTemplateStatusEvent: no local template — likely created out-of-band',
    );
    return { matched: false, newStatus };
  }

  const now = new Date();
  const update: Record<string, unknown> = { status: newStatus, updatedAt: now };
  switch (newStatus) {
    case 'approved':
      update.approvedAt = now;
      // Clear any prior rejection reason on re-approval.
      update.rejectionReason = null;
      break;
    case 'rejected':
      update.rejectedAt = now;
      if (payload.reason !== undefined) update.rejectionReason = payload.reason;
      break;
    case 'paused':
      update.pausedAt = now;
      if (payload.reason !== undefined) update.rejectionReason = payload.reason;
      break;
    case 'disabled':
      // No timestamp column for disabled; updatedAt covers it.
      if (payload.reason !== undefined) update.rejectionReason = payload.reason;
      break;
  }

  await db.updateOne('whatsappTemplates', { _id: row._id }, { $set: update } as never);
  logger.info(
    { eventId: event._id, templateId: row._id, name: row.name, newStatus },
    'handleWhatsappTemplateStatusEvent: applied',
  );
  return { matched: true, newStatus };
}
