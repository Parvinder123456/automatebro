import { getDb } from '@automatebro/shared/db/client';
import type { Tenant } from '@automatebro/shared/types/tenant';
/**
 * GET /api/v1/tenants/me — current user's tenant + role.
 *
 * Returns { tenant: { _id, name, slug }, role } | { tenant: null, role: null }.
 * Used by the (app) layout to decide redirect vs. pass-through, and by
 * spec 003 onboarding form to detect "already onboarded → redirect."
 */
import { NextResponse } from 'next/server';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const ctx = await getCtx();
  if (ctx === null) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required.' },
      { status: 401 },
    );
  }

  if (ctx.tenantId === null) {
    return NextResponse.json({ tenant: null, role: null });
  }

  // Direct db query — `tenants` is a non-multi-tenant collection (the
  // tenant IS the row, so it has no tenantId field). One of two
  // documented exceptions to "use repo, not db" (the other is `users`).
  const db = await getDb();
  const tenant = await db.queryOne<Tenant>('tenants', { _id: ctx.tenantId });
  if (tenant === null) {
    return NextResponse.json({ tenant: null, role: null });
  }
  return NextResponse.json({
    tenant: { _id: tenant._id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
    role: ctx.role,
  });
}
