/**
 * Phase 2.2 / spec 019 — GET /api/v1/aiUsage
 *
 * Returns the tenant's current-month AI spend + last N months history.
 * Read-only; pure aggregation over `aiUsage` rows.
 */
import { getAiUsageSummary } from '@automatebro/shared/handlers/aiUsage/getAiUsageSummary';
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'Sign in with a workspace first.' },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const monthsRaw = url.searchParams.get('months');
  const months =
    monthsRaw !== null && /^\d+$/.test(monthsRaw) ? Math.min(Number(monthsRaw), 24) : 6;

  const summary = await getAiUsageSummary(ctx, { months });
  return NextResponse.json(summary);
}
