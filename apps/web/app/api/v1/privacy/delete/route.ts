/**
 * Spec 013 §4.4 — POST /api/v1/privacy/delete.
 *
 * DPDP §12 / GDPR Art. 17 erasure right. Soft-deletes the tenant and
 * disconnects every connected igAccount. Hard-delete cron (spec 014)
 * runs 30 days later.
 *
 * Body shape: `{ confirm: 'DELETE' }` — typed string literal that
 * matches the user's typed confirmation in the modal. Anything else
 * → 400.
 */
import { requestTenantDeletion } from '@automatebro/shared/handlers/privacy/requestTenantDeletion';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../lib/auth/get-ctx';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DeleteInput = z.object({
  confirm: z.literal('DELETE'),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'No tenant to delete.' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = DeleteInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation',
        message: 'Type DELETE to confirm.',
      },
      { status: 400 },
    );
  }

  const result = await requestTenantDeletion(ctx);

  // Sign the user out so the stale session can't see partial state.
  // (The next protected route will redirect to /login or /deleted.)
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.json(
    {
      ok: true,
      tenantId: result.tenantId,
      deletedAt: result.deletedAt.toISOString(),
      deletionRequestedAt: result.deletionRequestedAt.toISOString(),
      alreadyDeleted: result.alreadyDeleted,
    },
    { status: 200 },
  );
}
