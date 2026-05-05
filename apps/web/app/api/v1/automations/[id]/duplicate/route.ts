/**
 * Phase 4.6 / spec 023 — POST /api/v1/automations/[id]/duplicate
 *
 * Clones the source automation + its trigger + its response into three
 * fresh rows. New automation defaults to status='paused' so it doesn't
 * immediately fire alongside the source.
 *
 * Optional body:
 *   - igAccountId: target a different IG account (must belong to the
 *     same tenant). Defaults to the source's igAccountId.
 *   - name: override the cloned name. Defaults to "<source.name> (copy)".
 */
import { duplicateAutomation } from '@automatebro/shared/handlers/automations/duplicateAutomation';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DuplicateInput = z.object({
  igAccountId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
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

  // Body is optional — empty {} is valid (means "duplicate as-is").
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text !== '') body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = DuplicateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await duplicateAutomation(ctx, {
      sourceAutomationId: id,
      ...(parsed.data.igAccountId !== undefined ? { igAccountId: parsed.data.igAccountId } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    });
    return NextResponse.json(
      { automation: result.automation, trigger: result.trigger, response: result.response },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message.includes('not found') || message.includes('not owned')) {
      return NextResponse.json({ error: 'not_found', message }, { status: 404 });
    }
    if (message.includes('does not belong')) {
      return NextResponse.json({ error: 'forbidden', message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'duplicate_failed', message: `Could not duplicate: ${message}` },
      { status: 500 },
    );
  }
}
