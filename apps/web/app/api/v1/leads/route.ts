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

  // CSV path: fetch all matching leads in one big page (5000 cap matches
  // pagination MAX_PAGE_SIZE). JSON path: paginate.
  if (format === 'csv') {
    const csvOpts: { pageSize: number; page: number; igAccountId?: string } = {
      pageSize: 5000,
      page: 1,
    };
    if (igAccountId !== undefined) csvOpts.igAccountId = igAccountId;
    const result = await listLeads(ctx, csvOpts);
    const body = leadsToCsv(result.items);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }

  // Spec 020 — JSON path is paginated. Keep `leads` as a flat array
  // for backwards-compat; add pagination meta alongside.
  const page = numParam(url.searchParams.get('page'), 1, 10_000);
  const pageSize = numParam(url.searchParams.get('pageSize'), 25, 5000);
  const opts: { page: number; pageSize: number; igAccountId?: string } = { page, pageSize };
  if (igAccountId !== undefined) opts.igAccountId = igAccountId;
  const result = await listLeads(ctx, opts);

  return NextResponse.json({
    leads: result.items,
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
