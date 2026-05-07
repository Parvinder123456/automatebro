/**
 * GET  /api/v1/whatsapp/templates — list templates for current tenant.
 * POST /api/v1/whatsapp/templates — create + optionally submit to Meta.
 *
 * Spec 026.
 */
import { createWhatsappTemplate } from '@automatebro/shared/handlers/whatsappTemplates/createWhatsappTemplate';
import { listWhatsappTemplates } from '@automatebro/shared/handlers/whatsappTemplates/listWhatsappTemplates';
import { logger } from '@automatebro/shared/logger';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }
  const templates = await listWhatsappTemplates(ctx);
  return NextResponse.json({ templates });
}

const CreateInput = z.object({
  whatsappAccountId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'name must be lowercase a-z, 0-9, or underscore'),
  category: z.enum(['utility', 'marketing', 'authentication']),
  language: z.string().min(2).max(10),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).optional(),
  submitToMeta: z.boolean(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'invalid JSON' }, { status: 400 });
  }
  const parsed = CreateInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  try {
    const input: Parameters<typeof createWhatsappTemplate>[0] = {
      whatsappAccountId: parsed.data.whatsappAccountId,
      name: parsed.data.name,
      category: parsed.data.category,
      language: parsed.data.language,
      bodyText: parsed.data.bodyText,
      submitToMeta: parsed.data.submitToMeta,
    };
    if (parsed.data.footerText !== undefined) {
      input.footerText = parsed.data.footerText;
    }
    const template = await createWhatsappTemplate(input, ctx);
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, 'POST /whatsapp/templates: create failed');
    return NextResponse.json({ error: 'create_failed', message }, { status: 400 });
  }
}
