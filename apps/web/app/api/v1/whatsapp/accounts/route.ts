/**
 * GET /api/v1/whatsapp/accounts — list connected WhatsApp accounts for
 * the current tenant.
 *
 * Spec 026. Tokens are NEVER returned (listWhatsappAccounts strips them).
 */
import { listWhatsappAccounts } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import { NextResponse } from 'next/server';
import { getCtx } from '../../../../../lib/auth/get-ctx';

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
  const accounts = await listWhatsappAccounts(ctx);
  return NextResponse.json({ accounts });
}
