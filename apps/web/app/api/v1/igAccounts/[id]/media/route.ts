/**
 * Phase 1.3 / spec 017 — GET /api/v1/igAccounts/[id]/media
 *
 * Returns a paginated slice of the connected IG account's grid media.
 * Used by the post picker in the automation builder UI.
 *
 * Query params:
 *   - cursor (optional): opaque cursor from a previous response's `next`
 *   - limit (optional, 1..100, default 50)
 *
 * Auth: standard tenant ctx; igAccount is repo-scoped so cross-tenant
 * fetches return 404.
 */
import { listIgMedia } from '@automatebro/shared/handlers/igAccounts/listIgMedia';
import { type NextRequest, NextResponse } from 'next/server';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id } = await context.params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null && /^\d+$/.test(limitRaw) ? Math.min(Number(limitRaw), 100) : 50;

  try {
    const result = await listIgMedia(ctx, { igAccountId: id, cursor, limit });
    return NextResponse.json({
      media: result.media,
      next: result.next,
      fromCache: result.fromCache,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    // 404 vs 502 hint: tenant-scoping miss is "not found"; everything
    // else is upstream failure (Meta down, token expired, decrypt fail).
    if (message.includes('not found') || message.includes('not owned')) {
      return NextResponse.json({ error: 'not_found', message }, { status: 404 });
    }
    if (message.includes('disconnected')) {
      return NextResponse.json({ error: 'disconnected', message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'meta_fetch_failed', message: `Could not fetch media: ${message}` },
      { status: 502 },
    );
  }
}
