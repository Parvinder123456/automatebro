/**
 * DELETE /api/v1/whatsapp/templates/[id] — delete or disable a template.
 *
 * Spec 026. Drafts are hard-deleted; submitted templates are soft-disabled.
 */
import { deleteWhatsappTemplate } from '@automatebro/shared/handlers/whatsappTemplates/deleteWhatsappTemplate';
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
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }
  const { id } = await params;
  try {
    const result = await deleteWhatsappTemplate({ whatsappTemplateId: id }, ctx);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, id }, 'DELETE /whatsapp/templates/[id]: failed');
    return NextResponse.json({ error: 'not_found', message }, { status: 404 });
  }
}
