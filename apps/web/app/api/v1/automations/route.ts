import {
  CreateAutomationInput,
  createAutomation,
} from '@automatebro/shared/handlers/automations/createAutomation';
import { listAutomations } from '@automatebro/shared/handlers/automations/listAutomations';
/**
 * Spec 007 — POST /api/v1/automations and GET list.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/auth/get-ctx';

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

export async function GET(): Promise<NextResponse> {
  const { ctx, response } = await requireAuthCtx();
  if (ctx === null) return response;
  const automations = await listAutomations(ctx);
  return NextResponse.json({ automations });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { ctx, response } = await requireAuthCtx();
  if (ctx === null) return response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'invalid JSON' }, { status: 400 });
  }
  const parsed = CreateAutomationInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await createAutomation(parsed.data, ctx);
    return NextResponse.json(
      {
        automation: result.automation,
        trigger: result.trigger,
        response: result.response,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: 'create_failed', message },
      { status: message.includes('does not belong') ? 403 : 500 },
    );
  }
}
