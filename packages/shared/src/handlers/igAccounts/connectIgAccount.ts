/**
 * Spec 004 — orchestrates the post-callback connect flow:
 *
 * 1. Exchange OAuth code → short-lived user token
 * 2. Exchange short-lived → long-lived user token
 * 3. List user's Pages
 * 4. For each page, resolve Instagram Business account (if any)
 * 5. Encrypt page access token with AES-256-GCM
 * 6. Upsert into igAccounts (one row per IG account)
 * 7. Best-effort subscribe page to webhook fields
 *
 * Returns the list of newly-connected IG accounts so the route handler
 * can build a redirect-back URL or response payload.
 */
import { randomUUID } from 'node:crypto';
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  getInstagramAccountForPage,
  listUserPages,
  subscribePageToWebhooks,
} from '../../adapters/meta.js';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
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
const LONG_LIVED_TOKEN_TTL_DAYS = 60;

export async function connectIgAccount(
  input: ConnectIgAccountInput,
  ctx: Ctx,
): Promise<ConnectedAccount[]> {
  requireTenant(ctx);
  const env = loadEnv();

  // Step 1 + 2: code → short → long-lived user token.
  const short = await exchangeCodeForUserToken({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: input.redirectUri,
    code: input.code,
  });
  const longLived = await exchangeForLongLivedUserToken({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    shortLivedToken: short.accessToken,
  });

  // Step 3: list pages.
  const pages = await listUserPages(longLived.accessToken);
  if (pages.length === 0) {
    logger.warn({ tenantId: ctx.tenantId }, 'connectIgAccount: user has no pages');
    return [];
  }

  // Step 4: for each page, see if it has an IG Business account.
  const connected: ConnectedAccount[] = [];
  const db = await getDb();

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

    // Step 5: encrypt the page access token.
    const encrypted = encryptToken(page.accessToken);

    // Step 6: upsert. If the user re-connects, we refresh the token.
    const accountId = randomUUID();
    const now = new Date();
    const tokenExpiresAt = new Date(
      now.getTime() + LONG_LIVED_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    let existing: { _id: string } | null = null;
    try {
      existing = await db.queryOne<{ _id: string }>('igAccounts', {
        tenantId: ctx.tenantId,
        igUserId: ig.igUserId,
      } as never);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'connectIgAccount: existing-account lookup failed (continuing as insert)',
      );
    }

    if (existing !== null) {
      // Refresh ciphertext + iv + tag + token expiry for the existing row.
      await db.updateOne(
        'igAccounts',
        { _id: existing._id, tenantId: ctx.tenantId } as never,
        {
          $set: {
            accessTokenCiphertext: encrypted.ciphertext,
            accessTokenIv: encrypted.iv,
            accessTokenTag: encrypted.tag,
            tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
            tokenExpiresAt,
            scopes: REQUIRED_SCOPES,
            pageId: page.id,
            pageName: page.name,
            igUsername: ig.igUsername,
            disconnectedAt: null,
          },
        } as never,
      );
    } else {
      const doc: IgAccount = {
        _id: accountId,
        tenantId: ctx.tenantId,
        igUserId: ig.igUserId,
        igUsername: ig.igUsername,
        pageId: page.id,
        pageName: page.name,
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenTag: encrypted.tag,
        tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
        tokenExpiresAt,
        scopes: REQUIRED_SCOPES,
        webhookSubscribedAt: null,
        connectedAt: now,
        disconnectedAt: null,
      };
      await db.insertOne('igAccounts', doc as never);
    }

    // Step 7: best-effort webhook subscription. Doesn't block on failure.
    let webhookSubscribed = false;
    try {
      await subscribePageToWebhooks({
        pageId: page.id,
        pageAccessToken: page.accessToken,
        fields: WEBHOOK_FIELDS,
      });
      webhookSubscribed = true;
      await db.updateOne(
        'igAccounts',
        { tenantId: ctx.tenantId, igUserId: ig.igUserId } as never,
        { $set: { webhookSubscribedAt: new Date() } } as never,
      );
    } catch (err) {
      logger.warn(
        { pageId: page.id, err: err instanceof Error ? err.message : String(err) },
        'subscribePageToWebhooks failed; continuing — webhook will need re-subscribe later',
      );
    }

    connected.push({
      _id: existing?._id ?? accountId,
      igUserId: ig.igUserId,
      igUsername: ig.igUsername,
      pageId: page.id,
      pageName: page.name,
      webhookSubscribed,
    });
  }

  logger.info(
    { tenantId: ctx.tenantId, connectedCount: connected.length, pagesScanned: pages.length },
    'connectIgAccount completed',
  );
  return connected;
}
