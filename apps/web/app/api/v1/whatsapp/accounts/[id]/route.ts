/**
 * DELETE /api/v1/whatsapp/accounts/[id] — disconnect a WhatsApp account.
 *
 * Spec 026. Soft-disconnect only — sets `disconnectedAt` on the row.
 * Leads + events with this account ID remain intact.
 */
import { disconnectWhatsapp } from '@automatebro/shared/handlers/whatsappAccounts/disconnectWhatsapp';
import { logger } from '@automatebro/shared/logger';
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  const { id } = await params;
  try {
    const result = await disconnectWhatsapp({ whatsappAccountId: id }, ctx);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, whatsappAccountId: id }, 'DELETE /whatsapp/accounts: failed');
    return NextResponse.json(
      { error: 'not_found', message: 'No such account for this tenant.' },
      { status: 404 },
    );
  }
}
