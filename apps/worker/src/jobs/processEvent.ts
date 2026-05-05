import { getDb } from '@automatebro/shared/db/client';
import { captureLead } from '@automatebro/shared/handlers/captureLead';
import { processCommentEvent } from '@automatebro/shared/handlers/processCommentEvent';
import { processDmEvent } from '@automatebro/shared/handlers/processDmEvent';
import { processStoryReplyEvent } from '@automatebro/shared/handlers/processStoryReplyEvent';
import { logger } from '@automatebro/shared/logger';
import type { ProcessEventJobType } from '@automatebro/shared/queue/jobTypes';
import type { EventRecord } from '@automatebro/shared/types/tenant';
/**
 * Spec 006 — process a webhook event.
 * Branches on event.kind:
 *   - 'comment'     → processCommentEvent (spec 007)
 *   - 'message'     → captureLead (spec 009) + processDmEvent (spec 015) in parallel
 *   - 'storyReply'  → processStoryReplyEvent (spec 018 / Phase 1.4) — handler is
 *                     ready; production traffic is gated on Meta App Review for
 *                     `instagram_manage_messages`. Until WEBHOOK_FIELDS includes
 *                     `messages`, no storyReply events arrive.
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
    case 'message': {
      // Spec 015 — fan out captureLead (spec 009) + processDmEvent in
      // parallel. They write to disjoint tables (leads vs sends +
      // automations) and are genuinely independent. CLAUDE.md Critical
      // Rule #8: independent awaits parallelise via Promise.all.
      //
      // If either throws, BullMQ retries the whole job. captureLead's
      // upsert is idempotent on (tenantId, igAccountId, igUserId), and
      // processDmEvent inserts a fresh `sends` row with a new uuid each
      // time — duplicate sends in the queue would re-enqueue against
      // the same eventId. To prevent that on retry, processDmEvent
      // dedupes by checking `sends WHERE eventId = ?` before inserting
      // (defence-in-depth alongside BullMQ's at-least-once semantics).
      const [captured, processed] = await Promise.all([captureLead(event), processDmEvent(event)]);
      logger.info({ jobId: job.id, eventId: event._id, ...captured }, 'captureLead: completed');
      logger.info({ jobId: job.id, eventId: event._id, ...processed }, 'processDmEvent: completed');
      break;
    }
    case 'storyReply': {
      const result = await processStoryReplyEvent(event);
      logger.info(
        { jobId: job.id, eventId: event._id, ...result },
        'processStoryReplyEvent: completed',
      );
      break;
    }
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
