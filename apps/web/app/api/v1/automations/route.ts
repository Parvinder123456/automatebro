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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { ctx, response } = await requireAuthCtx();
  if (ctx === null) return response;

  const url = new URL(request.url);
  const page = numParam(url.searchParams.get('page'), 1, 10_000);
  const pageSize = numParam(url.searchParams.get('pageSize'), 25, 5000);

  const result = await listAutomations(ctx, { page, pageSize });
  // Spec 020 — keep `automations` as a flat array (backwards-compat
  // with E2E tests + existing dashboard count); add pagination meta
  // alongside.
  return NextResponse.json({
    automations: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    hasNext: result.hasNext,
  });
}

function numParam(raw: string | null, fallback: number, max: number): number {
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  return Math.max(1, Math.min(max, Number(raw)));
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
