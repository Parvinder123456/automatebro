/**
 * Phase 4.5 / spec 022 — POST /api/v1/automations/[id]/preview
 *
 * Dry-run an automation against a sample message. Returns the keyword
 * match decision + the rendered DM (or fallback for AI mode). No
 * outbound DM, no AI call, no DB write.
 */
import { previewAutomation } from '@automatebro/shared/handlers/automations/previewAutomation';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PreviewInput = z.object({
  sampleText: z.string().min(1).max(2000),
  sampleUsername: z.string().min(1).max(100).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = PreviewInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', message: 'sampleText is required (1–2000 chars).' },
      { status: 400 },
    );
  }

  const result = await previewAutomation(ctx, {
    automationId: id,
    sampleText: parsed.data.sampleText,
    ...(parsed.data.sampleUsername !== undefined
      ? { sampleUsername: parsed.data.sampleUsername }
      : {}),
  });
  return NextResponse.json(result);
}
