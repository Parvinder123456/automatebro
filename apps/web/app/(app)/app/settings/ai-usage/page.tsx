/**
 * Phase 2.2 / spec 019 — full AI usage page.
 *
 * Current month + last 6 months as a table. Costs in INR (rendered from
 * paise), tokens with Indian-locale grouping. Read-only.
 */
import {
  type MonthlyUsage,
  formatPaise,
  formatTokens,
  getAiUsageSummary,
} from '@automatebro/shared/handlers/aiUsage/getAiUsageSummary';
import { redirect } from 'next/navigation';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const metadata = { title: 'AI usage — AutomateBro' };
export const dynamic = 'force-dynamic';

const PLAN_DEFAULTS_BLURB =
  'Defaults: Free ₹100/mo · Starter ₹500/mo · Growth ₹2,000/mo · Agency ₹5,000/mo';

export default async function AiUsagePage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const summary = await getAiUsageSummary(ctx, { months: 6 });
  const { current, history, plan } = summary;

  return (
    <main className="p-8" data-testid="ai-usage-page">
      <header className="mb-6">
        <p className="mb-1 text-sm text-gray-600">
          <a href="/app/settings" className="underline hover:text-black">
            ← Back to settings
          </a>
        </p>
        <h1 className="text-3xl font-semibold">AI usage</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tokens consumed by AI replies and intent classification, billed in INR. Cap is enforced at
          the API boundary — once reached, AI replies fall back to the static template you
          configured. {PLAN_DEFAULTS_BLURB}.
        </p>
      </header>

      <section className="mb-8 rounded border bg-white p-5" data-testid="ai-usage-current-month">
        <h2 className="text-lg font-semibold">This month ({current.month})</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-4">
          <Stat label="Cost" value={formatPaise(current.costInr)} />
          <Stat label="Cap" value={formatPaise(current.cap)} />
          <Stat label="Input tokens" value={formatTokens(current.inputTokens)} />
          <Stat label="Output tokens" value={formatTokens(current.outputTokens)} />
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded bg-gray-100">
          <div
            className={`h-full ${
              current.pctUsed >= 100
                ? 'bg-red-600'
                : current.pctUsed >= 80
                  ? 'bg-amber-500'
                  : 'bg-black'
            }`}
            style={{ width: `${Math.min(100, current.pctUsed)}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="mt-2 text-xs text-gray-600">
          {current.pctUsed}% of cap used · plan: <span className="font-medium">{plan}</span>
        </p>
      </section>

      <section data-testid="ai-usage-history">
        <h2 className="mb-3 text-lg font-semibold">Last 6 months</h2>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Cap</th>
                <th className="px-4 py-2">Input tokens</th>
                <th className="px-4 py-2">Output tokens</th>
                <th className="px-4 py-2">% of cap</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-gray-500" colSpan={6}>
                    No history yet — this is your first active month.
                  </td>
                </tr>
              ) : (
                history.map((row) => <HistoryRow key={row.month} row={row} />)
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Synthetic rows ("0 used") are shown for months with no AI activity.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function HistoryRow({ row }: { row: MonthlyUsage }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{row.month}</td>
      <td className="px-4 py-2">{formatPaise(row.costInr)}</td>
      <td className="px-4 py-2 text-gray-500">{formatPaise(row.cap)}</td>
      <td className="px-4 py-2 text-gray-700">{formatTokens(row.inputTokens)}</td>
      <td className="px-4 py-2 text-gray-700">{formatTokens(row.outputTokens)}</td>
      <td className="px-4 py-2 text-gray-700">{row.pctUsed}%</td>
    </tr>
  );
}
