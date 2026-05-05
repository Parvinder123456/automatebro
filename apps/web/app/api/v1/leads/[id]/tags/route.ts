/**
 * Phase 4.4 / spec 024 — PATCH /api/v1/leads/[id]/tags
 *
 * Edit a lead's tags. Three operation modes (mutually exclusive):
 *   { tags: string[] }   — replace the entire tag list
 *   { add: string[] }    — union with existing
 *   { remove: string[] } — remove specified
 */
import { updateLeadTags } from '@automatebro/shared/handlers/leads/updateLeadTags';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TagsInput = z
  .object({
    tags: z.array(z.string()).max(64).optional(),
    add: z.array(z.string()).max(64).optional(),
    remove: z.array(z.string()).max(64).optional(),
  })
  .refine((v) => v.tags !== undefined || v.add !== undefined || v.remove !== undefined, {
    message: 'Provide one of tags / add / remove.',
  })
  .refine((v) => !(v.tags !== undefined && (v.add !== undefined || v.remove !== undefined)), {
    message: 'tags is mutually exclusive with add/remove.',
  });

export async function PATCH(
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
  const parsed = TagsInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await updateLeadTags(ctx, {
      leadId: id,
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.add !== undefined ? { add: parsed.data.add } : {}),
      ...(parsed.data.remove !== undefined ? { remove: parsed.data.remove } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message.includes('not found') || message.includes('not owned')) {
      return NextResponse.json({ error: 'not_found', message }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'update_failed', message: `Could not update tags: ${message}` },
      { status: 500 },
    );
  }
}
