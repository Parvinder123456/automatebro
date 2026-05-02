/**
 * POST /logout — sign out + clear session cookies + redirect home.
 *
 * Spec 002 §6.4. Form-action style (HTML form posting), so SameSite=Lax
 * provides sufficient CSRF protection for this read-mostly action.
 *
 * GET is rejected to prevent CSRF-via-image-tag accidents.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Use the request's own origin so dev (port 3000/3001/4010), preview,
  // and production all redirect to the right host without env lookups.
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'method_not_allowed', message: 'POST to /logout to sign out.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
