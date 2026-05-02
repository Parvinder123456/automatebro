/**
 * GET /api/v1/auth/callback
 *
 * Spec 002 §6.1, §6.3. Single redirect target for both:
 *   - Email verification links (?token_hash=…&type=signup)
 *   - OAuth code exchanges (?code=…) — currently unused under C-lite
 *     mode but the route handles them so re-enabling Google later is a
 *     one-line change.
 *
 * Sets the auth cookie on the redirect response, then sends the user to
 * the `next` query param (defaults to /app).
 */
import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { safeRedirectPath } from '../../../../../lib/auth/public-paths';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  // Open-redirect protection: only relative same-origin paths allowed.
  const next = safeRedirectPath(url.searchParams.get('next'));

  const supabase = await createSupabaseServerClient();

  // OAuth code-exchange path (Google, etc.).
  if (code !== null) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error !== null) {
      return redirectToError(request, `oauth: ${error.message}`);
    }
    return NextResponse.redirect(new URL(next, request.url), { status: 303 });
  }

  // Email verification / recovery path.
  if (tokenHash !== null && type !== null) {
    // type is EmailOtpType ("signup" | "invite" | "magiclink" | "recovery" |
    // "email_change" | "email"). We narrow the URL string to that union;
    // Supabase rejects unknown values server-side.
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error !== null) {
      return redirectToError(request, `verify: ${error.message}`);
    }
    return NextResponse.redirect(new URL(next, request.url), { status: 303 });
  }

  // Neither query param present — malformed callback.
  return redirectToError(request, 'callback missing code or token_hash');
}

function redirectToError(request: NextRequest, reason: string): NextResponse {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', reason);
  return NextResponse.redirect(url, { status: 303 });
}
