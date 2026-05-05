/**
 * Spec 011 §3.4 — GET /api/v1/sends.
 *
 * Lists outbound DM/comment-reply sends for the tenant. Query params:
 *   ?status=sent|failed|queued|rateLimited|outsideWindow
 *   ?igAccountId=<uuid>
 *   ?automationId=<uuid>
 *   ?limit=<n> (default 1000, max 5000)
 */
import { listSends } from '@automatebro/shared/handlers/sends/listSends';
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES = ['queued', 'sent', 'failed', 'rateLimited', 'outsideWindow'] as const;
type SendStatus = (typeof VALID_STATUSES)[number];

function isStatus(s: string | null): s is SendStatus {
  return s !== null && (VALID_STATUSES as readonly string[]).includes(s);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json({ error: 'no_tenant' }, { status: 400 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const igAccountId = url.searchParams.get('igAccountId') ?? undefined;
  const automationId = url.searchParams.get('automationId') ?? undefined;
  const page = numParam(url.searchParams.get('page'), 1, 10_000);
  const pageSize = numParam(url.searchParams.get('pageSize'), 25, 5000);

  const opts: Parameters<typeof listSends>[1] = { page, pageSize };
  if (isStatus(statusParam)) opts.status = statusParam;
  if (igAccountId !== undefined) opts.igAccountId = igAccountId;
  if (automationId !== undefined) opts.automationId = automationId;

  const result = await listSends(ctx, opts);
  // Spec 020 — keep `sends` as a flat array for backwards-compat;
  // add pagination meta alongside.
  return NextResponse.json({
    sends: result.items,
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
