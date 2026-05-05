import { getDb } from '@automatebro/shared/db/client';
import type { Tenant } from '@automatebro/shared/types/tenant';
import { redirect } from 'next/navigation';
import { PrivacyPanel } from '../../../../components/settings/privacy-panel';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Settings — AutomateBro' };
export const dynamic = 'force-dynamic';

/**
 * Spec 013 §4.5 — workspace settings page.
 *
 * Shows the workspace name + DPDP consent timestamp, then the privacy
 * actions panel (export / delete). Future settings tabs (billing, team,
 * API keys) plug in here as additional sections.
 */
export default async function SettingsPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const db = await getDb();
  const tenant = await db.queryOne<Tenant>('tenants', { _id: ctx.tenantId } as never);
  const workspaceName = tenant?.name ?? 'Workspace';
  const consentAt = tenant?.dpdpConsentAt ?? null;

  return (
    <main className="p-8" data-testid="settings-page">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your workspace and exercise your data rights.
        </p>
      </header>

      <section className="mb-8 rounded border bg-white p-5" data-testid="workspace-info">
        <h2 className="text-lg font-semibold">Workspace</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-600">Name</dt>
            <dd className="mt-1 font-medium">{workspaceName}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Plan</dt>
            <dd className="mt-1 font-medium capitalize">{tenant?.plan ?? 'free'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Slug</dt>
            <dd className="mt-1 font-mono text-sm text-gray-700">{tenant?.slug ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">DPDP consent recorded</dt>
            <dd className="mt-1 text-sm">
              {consentAt !== null && consentAt !== undefined
                ? new Date(consentAt).toISOString().slice(0, 10)
                : 'Not recorded'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-8 rounded border bg-white p-5" data-testid="ai-usage-link-section">
        <h2 className="text-lg font-semibold">AI usage</h2>
        <p className="mt-1 text-sm text-gray-600">
          See how much of your monthly AI cap you've used and a 6-month history.
        </p>
        <a
          href="/app/settings/ai-usage"
          className="mt-3 inline-block rounded border px-4 py-2 text-sm hover:bg-gray-50"
        >
          View AI usage →
        </a>
      </section>

      <PrivacyPanel workspaceName={workspaceName} />
    </main>
  );
}
