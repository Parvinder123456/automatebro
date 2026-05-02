import { deleteAutomation } from '@automatebro/shared/handlers/automations/deleteAutomation';
import {
  UpdateAutomationInput,
  updateAutomation,
} from '@automatebro/shared/handlers/automations/updateAutomation';
/**
 * Spec 007 — PATCH and DELETE /api/v1/automations/{id}.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthCtx = NonNullable<Awaited<ReturnType<typeof getCtx>>>;
type AuthResult = { ctx: AuthCtx; response: null } | { ctx: null; response: NextResponse };

async function requireAuthCtx(): Promise<AuthResult> {
  const ctx = await getCtx();
  if (ctx === null) {
    return { ctx: null, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (ctx.tenantId === null) {
    return { ctx: null, response: NextResponse.json({ error: 'no_tenant' }, { status: 400 }) };
  }
  return { ctx, response: null };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { ctx, response } = await requireAuthCtx();
  if (ctx === null) return response;
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const parsed = UpdateAutomationInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await updateAutomation(id, parsed.data, ctx);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { ctx, response } = await requireAuthCtx();
  if (ctx === null) return response;
  const { id } = await context.params;
  await deleteAutomation(id, ctx);
  return NextResponse.json({ ok: true });
}
