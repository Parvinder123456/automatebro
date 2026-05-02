import { getDb } from '@automatebro/shared/db/client';
import type { Tenant } from '@automatebro/shared/types/tenant';
import { redirect } from 'next/navigation';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Dashboard — AutomateBro' };

/**
 * Spec 003 — placeholder dashboard. Shows the user's email + workspace
 * name. Spec 011 replaces this with a real automation/leads/sends UI.
 */
export default async function DashboardPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    // Defence in depth — the layout should have redirected already.
    redirect('/onboarding');
  }

  const db = await getDb();
  const tenant = await db.queryOne<Tenant>('tenants', { _id: ctx.tenantId });

  return (
    <main className="mx-auto max-w-2xl p-8" data-testid="dashboard-page">
      <h1 className="mb-4 text-3xl font-semibold">Dashboard</h1>
      <p className="text-gray-700">
        Workspace: <strong data-testid="workspace-name">{tenant?.name ?? 'unknown'}</strong>
      </p>
      <p className="text-sm text-gray-500">
        Signed in as <strong>{ctx.email}</strong>
      </p>
      <p className="mt-6 text-sm text-gray-600">
        This is a placeholder. Automation builder, send history, and leads land in spec 011.
      </p>
      <form action="/logout" method="POST" className="mt-6">
        <button type="submit" className="rounded border px-4 py-2 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
