import { generateAiReply as generateAiReplyHandler } from '@automatebro/shared/handlers/generateAiReply';
import { logger } from '@automatebro/shared/logger';
import type { GenerateAiReplyJobType } from '@automatebro/shared/queue/jobTypes';
/**
 * Spec 008 — generate-ai-reply job. Real implementation.
 *
 * Calls the shared handler which:
 *   - checks aiUsage cap
 *   - calls OpenAI chat completion
 *   - runs moderation
 *   - falls back to static template on AI failure / moderation flag
 *   - enqueues send-dm with the rendered content
 */
import type { Job } from 'bullmq';

export async function generateAiReply(data: GenerateAiReplyJobType, job: Job): Promise<void> {
  const result = await generateAiReplyHandler({
    eventId: data.eventId,
    responseId: data.responseId,
    sendId: data.sendId,
  });
  logger.info(
    { jobId: job.id, sendId: data.sendId, status: result.status, costInr: result.costInrAdded },
    `generateAiReply: ${result.status}`,
  );
}
