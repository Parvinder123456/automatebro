import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
/**
 * GET /api/v1/igAccounts — list connected Instagram accounts for the
 * current tenant.
 *
 * Spec 004 §7. Tokens are NEVER returned (listIgAccounts strips them).
 */
import { NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
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
  const accounts = await listIgAccounts(ctx);
  return NextResponse.json({ accounts });
}
