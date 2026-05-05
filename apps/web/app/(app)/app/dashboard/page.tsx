import { getAiUsageSummary } from '@automatebro/shared/handlers/aiUsage/getAiUsageSummary';
import { listAutomations } from '@automatebro/shared/handlers/automations/listAutomations';
import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { countLeads } from '@automatebro/shared/handlers/leads/countLeads';
import { countSendsLast24h } from '@automatebro/shared/handlers/sends/countSendsLast24h';
import { redirect } from 'next/navigation';
import { AiUsageCard } from '../../../../components/dashboard/ai-usage-card';
import { OnboardingChecklist } from '../../../../components/dashboard/onboarding-checklist';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Dashboard — AutomateBro' };

export default async function DashboardPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const [automations, accounts, leadCount, sendCount, aiUsage] = await Promise.all([
    // Spec 020 — listAutomations now returns Paginated; for the dashboard
    // counter we just need the page-1 items + total. pageSize=100 so
    // counters still reflect the full active count up to that limit.
    listAutomations(ctx, { page: 1, pageSize: 100 }),
    listIgAccounts(ctx),
    countLeads(ctx),
    countSendsLast24h(ctx),
    getAiUsageSummary(ctx, { months: 0 }),
  ]);

  const activeAutomations = automations.items.filter(
    (a) => a.automation.status === 'active',
  ).length;

  const cards = [
    { label: 'Active automations', value: activeAutomations },
    { label: 'IG accounts', value: accounts.length },
    { label: 'Leads captured', value: leadCount },
    { label: 'Sends (24h)', value: sendCount },
  ];

  return (
    <div className="p-8" data-testid="dashboard-page">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      {/* Spec 025 / Phase 4.7 — auto-hides once all 4 steps are done. */}
      <OnboardingChecklist
        igAccountCount={accounts.length}
        automationCount={automations.total}
        sendCount={sendCount}
        leadCount={leadCount}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded border p-4">
            <div className="text-sm text-gray-600">{c.label}</div>
            <div className="mt-1 text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AiUsageCard summary={aiUsage} />
      </div>
    </div>
  );
}
