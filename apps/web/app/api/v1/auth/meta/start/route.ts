import { buildAuthorizationUrl } from '@automatebro/shared/adapters/meta';
import { loadEnv } from '@automatebro/shared/env';
import { signState } from '@automatebro/shared/meta/state';
/**
 * GET /api/v1/auth/meta/start
 *
 * Spec 004 §6 — initiate Meta OAuth. Builds the authorization URL,
 * sets a signed state cookie, and 302s the user to Meta.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.redirect(new URL('/login?returnTo=/app/integrations', request.url));
  }
  if (ctx.tenantId === null) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  const env = loadEnv();
  const redirectUri = new URL('/api/v1/auth/meta/callback', request.url).toString();
  const state = signState(ctx.tenantId);
  const authorizationUrl = buildAuthorizationUrl({
    appId: env.META_APP_ID,
    redirectUri,
    state,
    scopes: REQUIRED_SCOPES,
  });

  // The state cookie is a defence-in-depth duplicate — verifyState()
  // already validates the signed state in the URL. The cookie binds
  // the OAuth attempt to this browser session.
  const response = NextResponse.redirect(authorizationUrl, { status: 303 });
  response.cookies.set('meta_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 5 * 60,
    path: '/api/v1/auth/meta',
  });
  return response;
}
