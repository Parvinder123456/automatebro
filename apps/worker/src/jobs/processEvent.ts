import { getDb } from '@automatebro/shared/db/client';
import { logger } from '@automatebro/shared/logger';
import type { ProcessEventJobType } from '@automatebro/shared/queue/jobTypes';
import type { EventRecord } from '@automatebro/shared/types/tenant';
/**
 * Spec 006 — process a webhook event.
 *
 * For now this just looks up the event row, marks it processed, and
 * logs what kind it was. Spec 007+ will branch on event.kind to:
 *   - 'comment' → match keyword triggers, enqueue send-dm
 *   - 'message' → maybe enqueue capture-lead (regex parse for email)
 *   - 'storyReply' → match story-reply triggers, enqueue send-dm
 *   - 'messageReaction' → no-op for v1
 *   - 'mention' → no-op for v1
 */
import type { Job } from 'bullmq';

export async function processEvent(data: ProcessEventJobType, job: Job): Promise<void> {
  const db = await getDb();

  const event = await db.queryOne<EventRecord>('events', { _id: data.eventId } as never);
  if (event === null) {
    logger.warn(
      { jobId: job.id, eventId: data.eventId },
      'processEvent: event not found — skipping',
    );
    return;
  }

  if (event.processedAt !== null && event.processedAt !== undefined) {
    logger.info(
      { jobId: job.id, eventId: data.eventId, processedAt: event.processedAt },
      'processEvent: already processed — idempotent no-op',
    );
    return;
  }

  // Stub for spec 007+: branch on kind. v1 just logs + marks processed.
  logger.info(
    {
      jobId: job.id,
      eventId: event._id,
      kind: event.kind,
      tenantId: event.tenantId,
      igAccountId: event.igAccountId,
    },
    `processEvent: would handle ${event.kind} (real logic in spec 007+)`,
  );

  await db.updateOne(
    'events',
    { _id: data.eventId, processedAt: null } as never,
    { $set: { processedAt: new Date() } } as never,
  );
}
