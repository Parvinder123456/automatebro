/**
 * Spec 004 — orchestrates the post-callback connect flow:
 *
 * 1. Exchange OAuth code → short-lived user token
 * 2. Exchange short-lived → long-lived user token
 * 3. List user's Pages
 * 4. For each page, resolve Instagram Business account (if any)
 * 5. Encrypt page access token with AES-256-GCM (AAD = igUserId)
 * 6. Upsert into igAccounts via repo (one row per IG account)
 * 7. Best-effort subscribe page to webhook fields
 *
 * Returns the list of newly-connected IG accounts so the route handler
 * can build a redirect-back URL or response payload.
 */
import { randomUUID } from 'node:crypto';
import {
  type InstagramBusinessAccount,
  type MetaPage,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  getInstagramAccountForPage,
  listUserPages,
  subscribePageToWebhooks,
} from '../../adapters/meta.js';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import { loadEnv } from '../../env.js';
import { logger } from '../../logger.js';
import { encryptToken } from '../../meta/tokenCrypto.js';
import type { IgAccount } from '../../types/tenant.js';

export interface ConnectIgAccountInput {
  code: string;
  redirectUri: string;
}

export interface ConnectedAccount {
  _id: string;
  igUserId: string;
  igUsername: string;
  pageId: string;
  pageName: string | null;
  webhookSubscribed: boolean;
}

const WEBHOOK_FIELDS = ['comments', 'messages', 'message_reactions', 'mentions'];
const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];
const DEFAULT_TOKEN_KEY_VERSION = 1;
const PAGE_LIMIT_WARNING_THRESHOLD = 100;

/**
 * Persist one Page → IG account pair. Encrypts the page token with the
 * IG user id as AAD, upserts via repo (which auto-merges tenantId),
 * and best-effort subscribes the page to webhook fields.
 */
async function persistAndSubscribe(
  page: MetaPage,
  ig: InstagramBusinessAccount,
  ctx: Ctx & { tenantId: string },
): Promise<ConnectedAccount> {
  // Encrypt with AAD = igUserId so the ciphertext is bound to this row.
  const encrypted = encryptToken(page.accessToken, ig.igUserId);
  const now = new Date();

  // Look up existing row (repo auto-scopes by tenantId).
  const existing = await repo
    .queryOne<{ _id: string }>('igAccounts', { igUserId: ig.igUserId }, ctx)
    .catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'persistAndSubscribe: existing-account lookup failed (continuing as insert)',
      );
      return null;
    });

  let accountId: string;
  if (existing !== null) {
    accountId = existing._id;
    await repo.updateOne(
      'igAccounts',
      { _id: existing._id },
      {
        $set: {
          accessTokenCiphertext: encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenTag: encrypted.tag,
          tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
          tokenExpiresAt: null,
          scopes: REQUIRED_SCOPES,
          pageId: page.id,
          pageName: page.name,
          igUsername: ig.igUsername,
          disconnectedAt: null,
        },
      },
      ctx,
    );
  } else {
    accountId = randomUUID();
    const doc: Omit<IgAccount, 'tenantId'> = {
      _id: accountId,
      igUserId: ig.igUserId,
      igUsername: ig.igUsername,
      pageId: page.id,
      pageName: page.name,
      accessTokenCiphertext: encrypted.ciphertext,
      accessTokenIv: encrypted.iv,
      accessTokenTag: encrypted.tag,
      tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
      // Page Access Tokens never expire (per Meta docs); we don't
      // synthesise an expiry. Re-auth happens manually if Meta
      // invalidates a token.
      tokenExpiresAt: null,
      scopes: REQUIRED_SCOPES,
      webhookSubscribedAt: null,
      connectedAt: now,
      disconnectedAt: null,
    };
    await repo.insertOne('igAccounts', doc as Record<string, unknown>, ctx);
  }

  // Best-effort webhook subscription. Log + continue on failure.
  let webhookSubscribed = false;
  try {
    await subscribePageToWebhooks({
      pageId: page.id,
      pageAccessToken: page.accessToken,
      fields: WEBHOOK_FIELDS,
    });
    webhookSubscribed = true;
    await repo.updateOne(
      'igAccounts',
      { _id: accountId },
      { $set: { webhookSubscribedAt: new Date() } },
      ctx,
    );
  } catch (err) {
    logger.warn(
      { pageId: page.id, err: err instanceof Error ? err.message : String(err) },
      'subscribePageToWebhooks failed; continuing — re-connect to retry',
    );
  }

  return {
    _id: accountId,
    igUserId: ig.igUserId,
    igUsername: ig.igUsername,
    pageId: page.id,
    pageName: page.name,
    webhookSubscribed,
  };
}

export async function connectIgAccount(
  input: ConnectIgAccountInput,
  ctx: Ctx,
): Promise<ConnectedAccount[]> {
  requireTenant(ctx);
  const { META_APP_ID, META_APP_SECRET } = loadEnv();

  // Steps 1 + 2: code → short → long-lived user token.
  const short = await exchangeCodeForUserToken({
    appId: META_APP_ID,
    appSecret: META_APP_SECRET,
    redirectUri: input.redirectUri,
    code: input.code,
  });
  const longLived = await exchangeForLongLivedUserToken({
    appId: META_APP_ID,
    appSecret: META_APP_SECRET,
    shortLivedToken: short.accessToken,
  });

  // Step 3: list pages.
  const pages = await listUserPages(longLived.accessToken);
  if (pages.length === 0) {
    logger.warn({ tenantId: ctx.tenantId }, 'connectIgAccount: user has no pages');
    return [];
  }
  if (pages.length >= PAGE_LIMIT_WARNING_THRESHOLD) {
    logger.warn(
      { tenantId: ctx.tenantId, pagesReturned: pages.length },
      'connectIgAccount: hit Meta listUserPages limit; some pages may be missing — pagination unimplemented',
    );
  }

  // Step 4: for each page, resolve IG and persist.
  const connected: ConnectedAccount[] = [];
  for (const page of pages) {
    const ig = await getInstagramAccountForPage({
      pageId: page.id,
      pageAccessToken: page.accessToken,
    }).catch((err) => {
      logger.warn(
        { pageId: page.id, err: err instanceof Error ? err.message : String(err) },
        'getInstagramAccountForPage failed; skipping page',
      );
      return null;
    });
    if (ig === null) continue;

    const result = await persistAndSubscribe(page, ig, ctx);
    connected.push(result);
  }

  logger.info(
    { tenantId: ctx.tenantId, connectedCount: connected.length, pagesScanned: pages.length },
    'connectIgAccount completed',
  );
  return connected;
}
