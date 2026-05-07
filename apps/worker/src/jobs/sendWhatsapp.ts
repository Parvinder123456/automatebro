/**
 * Spec 026 — send-whatsapp job. Mirror of sendDM but for the WhatsApp
 * domain. All gates (service window, opt-out, daily cap, rate limit,
 * template status, encryption) live inside the shared handler.
 */
import { sendWhatsapp as sendWhatsappHandler } from '@automatebro/shared/handlers/sendWhatsapp';
import { logger } from '@automatebro/shared/logger';
import type { SendWhatsappJobType } from '@automatebro/shared/queue/jobTypes';
import type { Job } from 'bullmq';

export async function sendWhatsapp(data: SendWhatsappJobType, job: Job): Promise<void> {
  const result = await sendWhatsappHandler({
    sendId: data.sendId,
    whatsappAccountId: data.whatsappAccountId,
    recipientPhone: data.recipientPhone,
    content: data.content,
    automationId: data.automationId,
  });
  logger.info(
    { jobId: job.id, sendId: data.sendId, status: result.status },
    `sendWhatsapp: ${result.status}`,
  );
}
