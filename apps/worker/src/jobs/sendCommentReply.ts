import { replyToComment } from '@automatebro/shared/adapters/meta';
import { getDb } from '@automatebro/shared/db/client';
import { logger } from '@automatebro/shared/logger';
import { decryptToken } from '@automatebro/shared/meta/tokenCrypto';
import type { SendCommentReplyJobType } from '@automatebro/shared/queue/jobTypes';
import type { IgAccount } from '@automatebro/shared/types/tenant';
/**
 * Send a comment reply via the Instagram Graph API.
 * Decrypts the Page Access Token and calls POST /{comment-id}/replies.
 */
import type { Job } from 'bullmq';

export async function sendCommentReply(data: SendCommentReplyJobType, job: Job): Promise<void> {
  const db = await getDb();

  const account = await db.queryOne<IgAccount>('igAccounts', {
    _id: data.igAccountId,
  } as never);
  if (account === null) {
    await db.updateOne(
      'sends',
      { _id: data.sendId } as never,
      {
        $set: { status: 'failed', errorMessage: 'igAccount not found', failedAt: new Date() },
      } as never,
    );
    logger.warn({ jobId: job.id, sendId: data.sendId }, 'sendCommentReply: igAccount not found');
    return;
  }

  let accessToken: string;
  try {
    const ct = Buffer.isBuffer(account.accessTokenCiphertext)
      ? account.accessTokenCiphertext
      : Buffer.from(account.accessTokenCiphertext);
    const iv = Buffer.isBuffer(account.accessTokenIv)
      ? account.accessTokenIv
      : Buffer.from(account.accessTokenIv);
    const tag = Buffer.isBuffer(account.accessTokenTag)
      ? account.accessTokenTag
      : Buffer.from(account.accessTokenTag);
    accessToken = decryptToken({ ciphertext: ct, iv, tag }, account.igUserId);
  } catch (err) {
    await db.updateOne(
      'sends',
      { _id: data.sendId } as never,
      {
        $set: {
          status: 'failed',
          errorMessage: `decrypt failed: ${err instanceof Error ? err.message : String(err)}`,
          failedAt: new Date(),
        },
      } as never,
    );
    logger.error({ jobId: job.id, sendId: data.sendId }, 'sendCommentReply: decrypt failed');
    return;
  }

  try {
    const result = await replyToComment({
      commentId: data.commentId,
      message: data.message,
      accessToken,
    });
    await db.updateOne(
      'sends',
      { _id: data.sendId } as never,
      {
        $set: { status: 'sent', metaMessageId: result.commentId, sentAt: new Date() },
      } as never,
    );
    logger.info(
      { jobId: job.id, sendId: data.sendId, replyCommentId: result.commentId },
      'sendCommentReply: sent',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.updateOne(
      'sends',
      { _id: data.sendId } as never,
      { $set: { status: 'failed', errorMessage: message, failedAt: new Date() } } as never,
    );
    logger.error({ jobId: job.id, sendId: data.sendId, err: message }, 'sendCommentReply: failed');
  }
}
