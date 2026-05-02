/**
 * Spec 007 — send a DM via Meta Graph API.
 *
 * Pre-condition: a `sends` row in 'queued' status. This handler:
 *   1. Loads the row + igAccount (with encrypted token).
 *   2. Checks 24-hour messaging window. If closed → status=outsideWindow.
 *   3. Checks per-account rate limit. If over → status=rateLimited.
 *      Throw a retryable error; BullMQ delays + retries.
 *   4. Decrypts the Page Access Token.
 *   5. POSTs to Meta /me/messages.
 *   6. Records sends.status = sent / failed.
 *
 * Idempotency: a queued row in any non-queued status is a no-op (e.g.
 * if a retry fires after success, we already have status=sent).
 */
import { exchangeForLongLivedUserToken } from '../adapters/meta.js';
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { isWithinMessagingWindow } from '../meta/messageWindow.js';
import { checkAndConsumeRate } from '../meta/rateLimit.js';
import { decryptToken } from '../meta/tokenCrypto.js';
import type { IgAccount, Send } from '../types/tenant.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const SEND_TIMEOUT_MS = 15_000;

export interface SendDMInput {
  sendId: string;
  igAccountId: string;
  recipientPsid: string;
  content: string;
  automationId: string | null;
}

export interface SendDMResult {
  status: Send['status'];
  metaMessageId?: string;
  errorMessage?: string;
}

/**
 * Decrypt the Page Access Token for the given igAccount. AAD = igUserId
 * (matches what we encrypted with in connectIgAccount).
 */
function decryptAccessToken(account: IgAccount): string {
  const ct = Buffer.isBuffer(account.accessTokenCiphertext)
    ? account.accessTokenCiphertext
    : Buffer.from(account.accessTokenCiphertext);
  const iv = Buffer.isBuffer(account.accessTokenIv)
    ? account.accessTokenIv
    : Buffer.from(account.accessTokenIv);
  const tag = Buffer.isBuffer(account.accessTokenTag)
    ? account.accessTokenTag
    : Buffer.from(account.accessTokenTag);
  return decryptToken({ ciphertext: ct, iv, tag }, account.igUserId);
}

async function postMessage(args: {
  igUserId: string;
  accessToken: string;
  recipientPsid: string;
  content: string;
}): Promise<{ messageId: string }> {
  const url = `${META_GRAPH_BASE}/${args.igUserId}/messages`;
  const body = {
    recipient: { id: args.recipientPsid },
    message: { text: args.content },
    access_token: args.accessToken,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  const json = (await response.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    const msg = json.error?.message ?? `HTTP ${response.status}`;
    const isRetryable = response.status >= 500 || response.status === 429;
    const err = new Error(`meta send failed: ${msg}`);
    (err as Error & { retryable?: boolean; statusCode?: number }).retryable = isRetryable;
    (err as Error & { statusCode?: number }).statusCode = response.status;
    throw err;
  }
  return { messageId: json.message_id ?? '' };
}

export async function sendDM(input: SendDMInput): Promise<SendDMResult> {
  const db = await getDb();

  // Load the send row. Idempotency: skip if already non-queued.
  const send = await db.queryOne<Send>('sends', { _id: input.sendId } as never);
  if (send === null) {
    return { status: 'failed', errorMessage: 'send row not found' };
  }
  if (send.status !== 'queued') {
    logger.info({ sendId: input.sendId, status: send.status }, 'sendDM: not queued — skipping');
    return { status: send.status };
  }

  // Load the IG account.
  const account = await db.queryOne<IgAccount>('igAccounts', {
    _id: input.igAccountId,
  } as never);
  if (account === null) {
    await markSendFailed(input.sendId, 'igAccount not found');
    return { status: 'failed', errorMessage: 'igAccount not found' };
  }

  // 24-hour window check.
  const inWindow = await isWithinMessagingWindow({
    igAccountId: input.igAccountId,
    recipientPsid: input.recipientPsid,
  });
  if (!inWindow) {
    await markSendOutsideWindow(input.sendId);
    return { status: 'outsideWindow' };
  }

  // Per-account rate limit.
  const rate = await checkAndConsumeRate(input.igAccountId);
  if (!rate.allowed) {
    await markSendRateLimited(input.sendId, rate.retryAfterMs);
    // Throw retryable so BullMQ delays + retries.
    const err = new Error(`rate limited (${rate.current}/${rate.cap})`);
    (err as Error & { retryable?: boolean }).retryable = true;
    throw err;
  }

  // Decrypt + send.
  let accessToken: string;
  try {
    accessToken = decryptAccessToken(account);
  } catch (err) {
    await markSendFailed(
      input.sendId,
      `decrypt failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { status: 'failed', errorMessage: 'decrypt failed' };
  }

  try {
    const { messageId } = await postMessage({
      igUserId: account.igUserId,
      accessToken,
      recipientPsid: input.recipientPsid,
      content: input.content,
    });
    await db.updateOne(
      'sends',
      { _id: input.sendId } as never,
      { $set: { status: 'sent', metaMessageId: messageId, sentAt: new Date() } } as never,
    );
    return { status: 'sent', metaMessageId: messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = (err as Error & { retryable?: boolean })?.retryable === true;
    if (retryable) {
      // Don't mark failed; let BullMQ retry. Increment attempt counter.
      await db.updateOne(
        'sends',
        { _id: input.sendId } as never,
        { $set: { errorMessage: message }, $inc: { attempt: 1 } } as never,
      );
      throw err;
    }
    await markSendFailed(input.sendId, message);
    return { status: 'failed', errorMessage: message };
  }
}

async function markSendFailed(sendId: string, message: string): Promise<void> {
  const db = await getDb();
  await db.updateOne(
    'sends',
    { _id: sendId } as never,
    {
      $set: { status: 'failed', errorMessage: message, failedAt: new Date() },
    } as never,
  );
}

async function markSendOutsideWindow(sendId: string): Promise<void> {
  const db = await getDb();
  await db.updateOne(
    'sends',
    { _id: sendId } as never,
    { $set: { status: 'outsideWindow', failedAt: new Date() } } as never,
  );
}

async function markSendRateLimited(sendId: string, retryAfterMs: number): Promise<void> {
  const db = await getDb();
  await db.updateOne(
    'sends',
    { _id: sendId } as never,
    {
      $set: {
        status: 'rateLimited',
        errorMessage: `rate limited; retry after ${retryAfterMs}ms`,
      },
    } as never,
  );
}

// Quiet unused-import warnings — we may need exchangeForLongLivedUserToken
// later when we add token refresh.
void exchangeForLongLivedUserToken;
