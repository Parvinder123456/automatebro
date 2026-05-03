import { countLeads } from '@automatebro/shared/handlers/leads/countLeads';
import { countSendsLast24h } from '@automatebro/shared/handlers/sends/countSendsLast24h';
import { listAutomations } from '@automatebro/shared/handlers/automations/listAutomations';
import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { redirect } from 'next/navigation';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Dashboard — AutomateBro' };

export default async function DashboardPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const [automations, accounts, leadCount, sendCount] = await Promise.all([
    listAutomations(ctx),
    listIgAccounts(ctx),
    countLeads(ctx),
    countSendsLast24h(ctx),
  ]);

  const activeAutomations = automations.filter((a) => a.automation.status === 'active').length;

  const cards = [
    { label: 'Active automations', value: activeAutomations },
    { label: 'IG accounts', value: accounts.length },
    { label: 'Leads captured', value: leadCount },
    { label: 'Sends (24h)', value: sendCount },
  ];

  return (
    <div className="p-8" data-testid="dashboard-page">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded border p-4">
            <div className="text-sm text-gray-600">{c.label}</div>
            <div className="mt-1 text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
