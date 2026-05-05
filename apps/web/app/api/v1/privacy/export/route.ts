/**
 * Spec 013 §4.4 — GET /api/v1/privacy/export.
 *
 * DPDP §11 / GDPR Art. 15 access right. Returns a JSON file download
 * containing every tenant-scoped row owned by the caller's tenant,
 * with encrypted token bytes redacted (see exportTenantData for why).
 */
import { exportTenantData } from '@automatebro/shared/handlers/privacy/exportTenantData';
import { NextResponse } from 'next/server';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (ctx.tenantId === null) {
    return NextResponse.json(
      { error: 'no_tenant', message: 'No tenant to export.' },
      { status: 400 },
    );
  }

  const data = await exportTenantData(ctx);

  // Build a stable filename with the tenant slug + date. Slug is
  // already URL-safe (regex enforced in TenantSchema).
  const slug = data.tenant?.slug ?? 'workspace';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `automatebro-export-${slug}-${date}.json`;

  // NextResponse.json() strips Content-Disposition on some adapters
  // because it sets the JSON content-type itself. Build the Response
  // by hand so the disposition header survives.
  const body = JSON.stringify(data, null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
