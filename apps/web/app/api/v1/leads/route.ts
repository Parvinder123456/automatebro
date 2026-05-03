import { leadsToCsv, listLeads } from '@automatebro/shared/handlers/leads/listLeads';
/**
 * Spec 009 — GET /api/v1/leads
 *
 * Lists captured leads for the tenant. ?format=csv returns RFC 4180
 * CSV with text/csv content-type for easy download. ?igAccountId
 * filter scopes to one connected account.
 */
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
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const igAccountId = url.searchParams.get('igAccountId') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit =
    limitRaw !== null && /^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 5000) : 1000;

  const opts: { limit: number; igAccountId?: string } = { limit };
  if (igAccountId !== undefined) opts.igAccountId = igAccountId;
  const leads = await listLeads(ctx, opts);

  if (format === 'csv') {
    const body = leadsToCsv(leads);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  return NextResponse.json({ leads });
}
