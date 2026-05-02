import { getDb } from '@automatebro/shared/db/client';
import { processCommentEvent } from '@automatebro/shared/handlers/processCommentEvent';
import { logger } from '@automatebro/shared/logger';
import type { ProcessEventJobType } from '@automatebro/shared/queue/jobTypes';
import type { EventRecord } from '@automatebro/shared/types/tenant';
/**
 * Spec 006 — process a webhook event.
 * Spec 007 — branches on event.kind:
 *   - 'comment' → processCommentEvent (keyword match + enqueue send-dm)
 *   - 'message' → spec 009 will enqueue capture-lead
 *   - 'storyReply' → spec 011 (story-reply automations are post-launch)
 *   - 'messageReaction' / 'mention' → no-op for v1
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

  switch (event.kind) {
    case 'comment': {
      const result = await processCommentEvent(event);
      logger.info(
        { jobId: job.id, eventId: event._id, ...result },
        'processCommentEvent: completed',
      );
      break;
    }
    case 'message':
    case 'storyReply':
    case 'messageReaction':
    case 'mention':
      logger.info(
        { jobId: job.id, eventId: event._id, kind: event.kind },
        `processEvent: ${event.kind} — handler lands in a later spec, marking processed`,
      );
      break;
  }

  await db.updateOne(
    'events',
    { _id: data.eventId, processedAt: null } as never,
    { $set: { processedAt: new Date() } } as never,
  );
}
