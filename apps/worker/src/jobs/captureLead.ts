import { logger } from '@automatebro/shared/logger';
import type { CaptureLeadJobType } from '@automatebro/shared/queue/jobTypes';
/**
 * Spec 006 stub — real implementation lands in spec 009.
 */
import type { Job } from 'bullmq';

export async function captureLead(data: CaptureLeadJobType, job: Job): Promise<void> {
  logger.info(
    { jobId: job.id, eventId: data.eventId },
    'captureLead: STUB — real implementation in spec 009',
  );
}
