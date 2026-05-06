/**
 * Decides whether a path is publicly accessible (no auth required).
 *
 * Spec 002 §7. Single source of truth for the middleware allow-list.
 * Tested in apps/web/lib/auth/public-paths.test.ts.
 */

/**
 * Exact-match public paths.
 */
const PUBLIC_EXACT = new Set<string>([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/pricing',
  '/privacy',
  '/terms',
  '/dpa',
  '/deleted',
  '/api/v1/health',
]);

/**
 * Public path prefixes (matches if pathname starts with one of these).
 */
const PUBLIC_PREFIXES = ['/compare/', '/api/v1/auth/callback', '/api/v1/webhooks/', '/api/v1/privacy/callback'];

/**
 * Returns true if the path should be reachable without an authenticated
 * session. False otherwise.
 *
 * Note: webhook + health paths are technically public AND should skip
 * cookie work entirely; that special-casing happens in middleware.ts,
 * not here.
 */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Returns true for paths that should skip the Supabase cookie refresh
 * entirely — webhooks and health checks have no cookies and should be
 * fast-path.
 */
export function shouldSkipSession(pathname: string): boolean {
  return pathname.startsWith('/api/v1/webhooks/') || pathname === '/api/v1/health';
}

/**
 * Sanitises a `next` / `returnTo` URL parameter to prevent open-redirect
 * attacks. Only same-origin relative paths starting with a single `/`
 * are allowed. Anything else (absolute URLs, protocol-relative URLs,
 * `//evil.com`, paths with backslashes) is rejected and replaced with
 * the provided fallback.
 *
 * Spec 002 — see `code-reviewer` finding #1 (open redirect via `next`).
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/app'): string {
  if (raw === null || raw === undefined || raw === '') return fallback;
  // Must start with `/` AND second char must NOT be `/` or `\` (which
  // would make it protocol-relative or a Windows-style hijack).
  if (raw === '/') return raw;
  if (raw.length >= 2 && raw[0] === '/' && raw[1] !== '/' && raw[1] !== '\\') return raw;
  return fallback;
}
