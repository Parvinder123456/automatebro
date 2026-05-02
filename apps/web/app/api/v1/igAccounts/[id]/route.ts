import { disconnectIgAccount } from '@automatebro/shared/handlers/igAccounts/disconnectIgAccount';
/**
 * DELETE /api/v1/igAccounts/{id} — disconnect an Instagram account.
 *
 * Spec 004 §7. Hard-delete; idempotent (200 if not found).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    );
  }
  if (ctx.tenantId === null) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'Complete onboarding first.' },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  await disconnectIgAccount(id, ctx);
  return NextResponse.json({ ok: true });
}
