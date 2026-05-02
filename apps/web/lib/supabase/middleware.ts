import { loadEnv } from '@automatebro/shared/env';
/**
 * Supabase client for Next.js middleware. Refreshes the access token
 * if it's near expiry, then propagates any updated cookies to the
 * outgoing response.
 *
 * Spec 002 §4.1, §7.
 */
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export interface SessionRefreshResult {
  /**
   * The (possibly modified) NextResponse — return this from middleware
   * so refreshed cookies reach the browser.
   */
  response: NextResponse;
  /**
   * The currently-authenticated Supabase Auth user, or null if no
   * valid session.
   */
  user: { id: string; email: string | undefined } | null;
}

export async function refreshSession(request: NextRequest): Promise<SessionRefreshResult> {
  // Forward an x-pathname header so Server Components / layouts can
  // read the request path via next/headers without re-parsing the URL.
  // Spec 003 §8.3.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: forwardedHeaders } });
  const env = loadEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mutate the request cookies so any downstream middleware
          // sees the refreshed session, then rebuild the response with
          // updated cookies.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: forwardedHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (not getSession()) does a server-side validation of the
  // JWT — required for security per Supabase docs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response,
    user: user === null ? null : { id: user.id, email: user.email },
  };
}
