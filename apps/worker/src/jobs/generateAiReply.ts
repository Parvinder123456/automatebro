import { logger } from '@automatebro/shared/logger';
import type { GenerateAiReplyJobType } from '@automatebro/shared/queue/jobTypes';
/**
 * Spec 006 stub — real implementation lands in spec 008.
 */
import type { Job } from 'bullmq';

export async function generateAiReply(data: GenerateAiReplyJobType, job: Job): Promise<void> {
  logger.info(
    { jobId: job.id, eventId: data.eventId, responseId: data.responseId },
    'generateAiReply: STUB — real OpenAI call lands in spec 008',
  );
}
