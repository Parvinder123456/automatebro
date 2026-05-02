import { sendDM as sendDMHandler } from '@automatebro/shared/handlers/sendDM';
import { logger } from '@automatebro/shared/logger';
import type { SendDMJobType } from '@automatebro/shared/queue/jobTypes';
/**
 * Spec 007 — send-dm job. Real implementation. Decrypts the page
 * access token, checks 24h messaging window + per-account rate limit,
 * calls Meta /me/messages, and updates the sends row.
 *
 * Idempotency + retries are handled inside the shared handler. We
 * just unpack the job data and pass through.
 */
import type { Job } from 'bullmq';

export async function sendDM(data: SendDMJobType, job: Job): Promise<void> {
  const result = await sendDMHandler({
    sendId: data.sendId,
    igAccountId: data.igAccountId,
    recipientPsid: data.recipientPsid,
    content: data.content,
    automationId: data.automationId,
  });
  logger.info(
    { jobId: job.id, sendId: data.sendId, status: result.status },
    `sendDM: ${result.status}`,
  );
}
