/**
 * Phase 1.3 / spec 017 — list a tenant's IG media for the post picker.
 *
 * Tenant calls `GET /api/v1/igAccounts/[id]/media?cursor=...` from the
 * automation builder UI. We resolve the igAccount (tenant-scoped),
 * decrypt the page access token, and fetch a page of media from the
 * Meta Graph API.
 *
 * Cache-injection seam: callers can pass an optional `cache` adapter.
 * The default no-op cache means we always hit Meta (option C in the
 * Phase 1.3 design discussion). Phase 2 can swap a Redis-backed cache
 * in without touching the call sites — same shape:
 *
 *   await listIgMedia(ctx, { igAccountId, cursor }, { cache: redisCache });
 */
import { type MetaMedia, fetchUserMedia } from '../../adapters/meta.js';
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import { logger } from '../../logger.js';
import { decryptToken } from '../../meta/tokenCrypto.js';
import type { IgAccount } from '../../types/tenant.js';

export interface ListIgMediaInput {
  igAccountId: string;
  cursor?: string | null;
  limit?: number;
}

export interface ListIgMediaResult {
  media: MetaMedia[];
  next: string | null;
  fromCache: boolean;
}

export interface MediaCache {
  get(key: string): Promise<ListIgMediaResult | null>;
  set(key: string, value: ListIgMediaResult, ttlSeconds: number): Promise<void>;
}

const NOOP_CACHE: MediaCache = {
  async get() {
    return null;
  },
  async set() {
    // intentionally no-op
  },
};

const DEFAULT_TTL_SECONDS = 60 * 60; // 1h — only used when a real cache is wired

function cacheKey(igAccountId: string, cursor: string | null, limit: number): string {
  return `media:${igAccountId}:${cursor ?? 'first'}:${limit}`;
}

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

export async function listIgMedia(
  ctx: Ctx,
  input: ListIgMediaInput,
  opts: { cache?: MediaCache } = {},
): Promise<ListIgMediaResult> {
  const cache = opts.cache ?? NOOP_CACHE;
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const cursor = input.cursor ?? null;

  // Resolve igAccount via repo — tenant-scoped, so a tenant cannot fetch
  // another tenant's media.
  const account = await repo.queryOne<IgAccount>('igAccounts', { _id: input.igAccountId }, ctx);
  if (account === null) {
    throw new Error('igAccount not found or not owned by this tenant');
  }
  if (account.disconnectedAt !== null && account.disconnectedAt !== undefined) {
    throw new Error('igAccount has been disconnected');
  }

  const key = cacheKey(input.igAccountId, cursor, limit);
  const cached = await cache.get(key).catch(() => null);
  if (cached !== null) {
    return { ...cached, fromCache: true };
  }

  const accessToken = decryptAccessToken(account);

  const fetched = await fetchUserMedia({
    igUserId: account.igUserId,
    accessToken,
    limit,
    after: cursor,
  });

  const result: ListIgMediaResult = {
    media: fetched.media,
    next: fetched.next,
    fromCache: false,
  };

  // Best-effort cache write; never block the response.
  await cache.set(key, result, DEFAULT_TTL_SECONDS).catch((err) => {
    logger.warn(
      { igAccountId: input.igAccountId, err: err instanceof Error ? err.message : String(err) },
      'listIgMedia: cache write failed (non-fatal)',
    );
  });

  return result;
}
