import { logger } from '@automatebro/shared/logger';
import type { SendDMJobType } from '@automatebro/shared/queue/jobTypes';
/**
 * Spec 006 stub — real implementation lands in spec 007.
 *
 * Per engineering plan §6 Flow B (comment-to-DM), this handler will:
 *   1. Check 24-hour messaging window (events query)
 *   2. Apply per-account rate limit (BullMQ already enforces 185/hr
 *      via the limiter on the Worker — this handler trusts it)
 *   3. Render template (or wait for AI variant via generate-ai-reply)
 *   4. Decrypt access token from igAccounts
 *   5. POST /me/messages on Meta Graph API
 *   6. Update sends.status = 'sent' / 'failed' / 'rateLimited'
 */
import type { Job } from 'bullmq';

export async function sendDM(data: SendDMJobType, job: Job): Promise<void> {
  logger.info(
    {
      jobId: job.id,
      sendId: data.sendId,
      igAccountId: data.igAccountId,
      contentLength: data.content.length,
    },
    'sendDM: STUB — real Meta send happens in spec 007',
  );
  // Real impl in spec 007. Throwing here would cause BullMQ to retry
  // an unimplemented path, which is bad. Just log + return.
}
