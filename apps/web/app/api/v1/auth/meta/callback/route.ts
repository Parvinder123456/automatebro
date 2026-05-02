import { connectIgAccount } from '@automatebro/shared/handlers/igAccounts/connectIgAccount';
import { logger } from '@automatebro/shared/logger';
import { verifyState } from '@automatebro/shared/meta/state';
/**
 * GET /api/v1/auth/meta/callback
 *
 * Spec 004 §6 — handle Meta's OAuth redirect.
 *
 * Path:
 *   - On error from Meta (?error=access_denied&...): 302 to
 *     /app/integrations?error=<message>.
 *   - Otherwise: verify state, run connectIgAccount, 302 to
 *     /app/integrations?connected=N.
 *
 * NOTE: this is the OAUTH callback (different from /api/v1/auth/callback
 * which handles Supabase email-verification + Google OAuth).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function redirectToIntegrations(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const url = new URL('/app/integrations', request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorReason = url.searchParams.get('error_reason');

  // Meta redirected back with an explicit error.
  if (error !== null) {
    logger.warn(
      { error, errorReason, errorDescription: url.searchParams.get('error_description') },
      'meta callback: user denied or error',
    );
    return redirectToIntegrations(request, { error: errorReason ?? error });
  }

  if (code === null || state === null) {
    return redirectToIntegrations(request, { error: 'missing_code_or_state' });
  }

  // Cookie-bound state check. The cookie is REQUIRED — every legitimate
  // callback must have arrived via /start in the same browser session.
  // If the cookie is missing or doesn't match, the state was likely
  // replayed from a referrer leak or arrived from a different session.
  const cookieState = request.cookies.get('meta_oauth_state')?.value;
  if (cookieState === undefined || cookieState !== state) {
    logger.warn('meta callback: state cookie missing or mismatched — possible CSRF');
    return redirectToIntegrations(request, { error: 'state_mismatch' });
  }

  // Verify the state HMAC + extract tenantId.
  let stateTenantId: string;
  try {
    const verified = verifyState(state);
    stateTenantId = verified.tenantId;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'meta callback: state verification failed',
    );
    return redirectToIntegrations(request, { error: 'invalid_state' });
  }

  // Confirm the current session matches the tenant in the state.
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.redirect(new URL('/login?returnTo=/app/integrations', request.url));
  }
  if (ctx.tenantId !== stateTenantId) {
    logger.warn(
      { sessionTenantId: ctx.tenantId, stateTenantId },
      'meta callback: session tenant mismatch',
    );
    return redirectToIntegrations(request, { error: 'tenant_mismatch' });
  }

  // Run the connect orchestration.
  const redirectUri = new URL('/api/v1/auth/meta/callback', request.url).toString();
  let connected: Awaited<ReturnType<typeof connectIgAccount>>;
  try {
    connected = await connectIgAccount({ code, redirectUri }, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    logger.error(
      { err: message, tenantId: ctx.tenantId },
      'connectIgAccount threw — see server logs for stack',
    );
    // Generic error code only — do NOT leak internal error details
    // through the redirect URL (browser history, referrers, analytics).
    return redirectToIntegrations(request, { error: 'connect_failed' });
  }

  // Clear state cookie + redirect to integrations page.
  const response = redirectToIntegrations(request, {
    connected: String(connected.length),
  });
  response.cookies.delete('meta_oauth_state');
  return response;
}
