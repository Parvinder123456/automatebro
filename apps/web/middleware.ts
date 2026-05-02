/**
 * Spec 002 §7 — Next.js middleware: routes auth-aware redirects and
 * refreshes Supabase Auth cookies on every request.
 *
 * Behaviour:
 *  - /api/v1/webhooks/* and /api/v1/health: pass through, no cookie work.
 *  - Public allow-list (see lib/auth/public-paths): pass through with
 *    refreshed session.
 *  - Authenticated routes without a session:
 *      - /api/v1/* → 401 JSON (clean error for API consumers)
 *      - everything else → 302 to /login?returnTo=<original>
 *  - Authenticated routes WITH a session: pass through.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { isPublicPath, shouldSkipSession } from './lib/auth/public-paths';
import { refreshSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Webhooks + health endpoint: skip all session work.
  if (shouldSkipSession(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await refreshSession(request);

  // Public routes: pass through with refreshed session cookie.
  if (isPublicPath(pathname)) {
    return response;
  }

  // Authenticated routes: must have a session.
  if (user === null) {
    if (pathname.startsWith('/api/v1/')) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required.' },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals + static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
