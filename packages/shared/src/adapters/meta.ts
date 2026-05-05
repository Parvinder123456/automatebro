/**
 * Spec 004 — typed Meta Graph API client.
 *
 * Thin HTTP wrapper around the Graph API endpoints we use during OAuth
 * connect and (later, spec 005+) outbound DM sends. Single point of
 * change for the API version, retry policy, and rate-limit handling.
 *
 * Why not a generated SDK: Meta doesn't ship a typed Node SDK we can
 * trust; community ones lag. Our usage is narrow (~5 endpoints in v1),
 * so a hand-rolled wrapper is smaller and more auditable.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const META_OAUTH_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}`;

const REQUEST_TIMEOUT_MS = 15_000;

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly metaCode?: number,
    public readonly metaSubcode?: number,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

/**
 * Internal HTTP fetch wrapper. Adds timeout + Meta error parsing.
 * Throws MetaApiError on non-2xx OR on Meta's `{ error: ... }` envelope.
 */
async function metaFetch(url: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new MetaApiError(`Meta API request timed out after ${REQUEST_TIMEOUT_MS}ms`, 0);
    }
    throw new MetaApiError(
      `Meta API network error: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
  clearTimeout(timeoutId);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MetaApiError(
      `Meta API returned non-JSON response (status ${response.status})`,
      response.status,
    );
  }

  if (!response.ok) {
    const errorEnv = body as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    const message = errorEnv.error?.message ?? `HTTP ${response.status}`;
    throw new MetaApiError(
      `Meta API error: ${message}`,
      response.status,
      errorEnv.error?.code,
      errorEnv.error?.error_subcode,
    );
  }

  return body;
}

export interface OAuthCodeExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}

/**
 * Step 1 of the connect flow: exchange the short-lived OAuth code we
 * received from Meta's redirect for a short-lived USER access token.
 */
export async function exchangeCodeForUserToken(args: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<OAuthCodeExchangeResult> {
  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', args.appId);
  url.searchParams.set('client_secret', args.appSecret);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('code', args.code);
  const body = (await metaFetch(url.toString())) as {
    access_token: string;
    token_type: string;
    expires_in?: number;
  };
  const result: OAuthCodeExchangeResult = {
    accessToken: body.access_token,
    tokenType: body.token_type,
  };
  if (body.expires_in !== undefined) result.expiresIn = body.expires_in;
  return result;
}

/**
 * Step 2: exchange the short-lived user token for a long-lived
 * (~60-day) user token.
 */
export async function exchangeForLongLivedUserToken(args: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<OAuthCodeExchangeResult> {
  const url = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', args.appId);
  url.searchParams.set('client_secret', args.appSecret);
  url.searchParams.set('fb_exchange_token', args.shortLivedToken);
  const body = (await metaFetch(url.toString())) as {
    access_token: string;
    token_type: string;
    expires_in?: number;
  };
  const result: OAuthCodeExchangeResult = {
    accessToken: body.access_token,
    tokenType: body.token_type,
  };
  if (body.expires_in !== undefined) result.expiresIn = body.expires_in;
  return result;
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
}

/**
 * Step 3: list the user's Pages with their per-page access tokens
 * (these never expire as long as the long-lived user token is valid).
 */
export async function listUserPages(userAccessToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH_API_BASE}/me/accounts`);
  url.searchParams.set('access_token', userAccessToken);
  url.searchParams.set('fields', 'id,name,access_token');
  url.searchParams.set('limit', '100');
  const body = (await metaFetch(url.toString())) as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };
  return body.data.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
}

export interface InstagramBusinessAccount {
  igUserId: string;
  igUsername: string;
}

/**
 * Step 4 (per page): resolve a Page to its connected Instagram
 * Business account (if any). Returns null for pages without an IG
 * Business connection — those won't work with the messaging APIs.
 */
export async function getInstagramAccountForPage(args: {
  pageId: string;
  pageAccessToken: string;
}): Promise<InstagramBusinessAccount | null> {
  const url = new URL(`${GRAPH_API_BASE}/${args.pageId}`);
  url.searchParams.set('fields', 'instagram_business_account{id,username}');
  url.searchParams.set('access_token', args.pageAccessToken);
  const body = (await metaFetch(url.toString())) as {
    instagram_business_account?: { id: string; username: string };
  };
  if (!body.instagram_business_account) return null;
  return {
    igUserId: body.instagram_business_account.id,
    igUsername: body.instagram_business_account.username,
  };
}

/**
 * Subscribe our app to webhook events on a given Page. Best-effort —
 * caller logs failures and proceeds. Spec 005 wires the webhook
 * endpoint that receives these.
 */
export async function subscribePageToWebhooks(args: {
  pageId: string;
  pageAccessToken: string;
  fields: string[];
}): Promise<void> {
  const url = new URL(`${GRAPH_API_BASE}/${args.pageId}/subscribed_apps`);
  url.searchParams.set('subscribed_fields', args.fields.join(','));
  url.searchParams.set('access_token', args.pageAccessToken);
  await metaFetch(url.toString(), { method: 'POST' });
}

/**
 * Reply to an Instagram comment. Uses the Graph API endpoint
 * POST /{comment-id}/replies with the page access token.
 * Returns the new comment's ID.
 */
export async function replyToComment(args: {
  commentId: string;
  message: string;
  accessToken: string;
}): Promise<{ commentId: string }> {
  const url = new URL(`${GRAPH_API_BASE}/${args.commentId}/replies`);
  url.searchParams.set('message', args.message);
  url.searchParams.set('access_token', args.accessToken);
  const body = (await metaFetch(url.toString(), { method: 'POST' })) as {
    id?: string;
  };
  return { commentId: body.id ?? '' };
}

// ---------- Spec 017 / Phase 1.3: media listing for the post picker ----------

export interface MetaMedia {
  id: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | 'STORY' | 'OTHER';
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  caption: string | null;
  timestamp: string | null;
}

export interface FetchUserMediaResult {
  media: MetaMedia[];
  /** Cursor for the next page (opaque to us — pass back as `?after=...`). */
  next: string | null;
}

/**
 * List a user's IG media items via the Graph API.
 *
 * Endpoint: GET /{igUserId}/media?fields=id,media_type,permalink,thumbnail_url,media_url,caption,timestamp&limit=N
 *
 * - `thumbnailUrl` is set for VIDEO/REELS; `mediaUrl` is set for IMAGE.
 * - For CAROUSEL_ALBUM, Meta returns the cover image URL on `media_url`.
 * - Stories don't appear here (they have their own endpoint and 24h TTL);
 *   the post picker is for grid posts + reels only.
 */
export async function fetchUserMedia(args: {
  igUserId: string;
  accessToken: string;
  limit?: number;
  after?: string | null;
}): Promise<FetchUserMediaResult> {
  const url = new URL(`${GRAPH_API_BASE}/${args.igUserId}/media`);
  url.searchParams.set(
    'fields',
    'id,media_type,permalink,thumbnail_url,media_url,caption,timestamp',
  );
  url.searchParams.set('limit', String(args.limit ?? 50));
  url.searchParams.set('access_token', args.accessToken);
  if (args.after !== undefined && args.after !== null && args.after !== '') {
    url.searchParams.set('after', args.after);
  }
  const body = (await metaFetch(url.toString())) as {
    data?: Array<{
      id: string;
      media_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      caption?: string;
      timestamp?: string;
    }>;
    paging?: { cursors?: { after?: string }; next?: string };
  };
  const media: MetaMedia[] = (body.data ?? []).map((m) => {
    const rawType = (m.media_type ?? '').toUpperCase();
    const mediaType =
      rawType === 'IMAGE' ||
      rawType === 'VIDEO' ||
      rawType === 'CAROUSEL_ALBUM' ||
      rawType === 'REELS' ||
      rawType === 'STORY'
        ? (rawType as MetaMedia['mediaType'])
        : 'OTHER';
    return {
      id: m.id,
      mediaType,
      permalink: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? null,
      mediaUrl: m.media_url ?? null,
      caption: m.caption ?? null,
      timestamp: m.timestamp ?? null,
    };
  });
  // Meta returns BOTH `paging.next` (full URL) AND `paging.cursors.after`
  // (just the cursor). We stick with the cursor — it's stable and our
  // route handler reconstructs the URL itself.
  const next = body.paging?.next ? (body.paging.cursors?.after ?? null) : null;
  return { media, next };
}

/**
 * Build the OAuth authorization URL the browser should be redirected
 * to. Caller appends `state` and `redirect_uri`.
 */
export function buildAuthorizationUrl(args: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const url = new URL(`${META_OAUTH_BASE}/dialog/oauth`);
  url.searchParams.set('client_id', args.appId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('state', args.state);
  url.searchParams.set('scope', args.scopes.join(','));
  url.searchParams.set('response_type', 'code');
  return url.toString();
}
