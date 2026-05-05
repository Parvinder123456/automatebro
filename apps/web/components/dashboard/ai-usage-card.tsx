/**
 * Phase 2.2 / spec 019 — dashboard summary card for AI spend.
 *
 * Server Component: takes a pre-fetched summary from the parent page
 * (the dashboard already calls handlers in parallel via Promise.all).
 * Renders the current-month bar + a small "X% of cap used" tag.
 */
import {
  type AiUsageSummary,
  formatPaise,
} from '@automatebro/shared/handlers/aiUsage/getAiUsageSummary';

export function AiUsageCard({ summary }: { summary: AiUsageSummary }) {
  const { current, plan } = summary;
  const isWarn = current.pctUsed >= 80 && current.pctUsed < 100;
  const isOver = current.pctUsed >= 100;
  const barColor = isOver ? 'bg-red-600' : isWarn ? 'bg-amber-500' : 'bg-black';
  const tagColor = isOver
    ? 'bg-red-100 text-red-800'
    : isWarn
      ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-700';

  // Visual fill caps at 100% so a 250% bug-state doesn't blow out the
  // card width. The numeric tag still shows the real %.
  const fillPct = Math.min(100, current.pctUsed);

  return (
    <div className="rounded border bg-white p-4" data-testid="ai-usage-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">AI usage this month</h3>
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${tagColor}`}
          data-testid="ai-usage-pct"
        >
          {current.pctUsed}% of cap
        </span>
      </div>

      <p className="mt-2 text-2xl font-bold" data-testid="ai-usage-cost">
        {formatPaise(current.costInr)}
      </p>
      <p className="text-xs text-gray-600">
        of {formatPaise(current.cap)} cap · {plan} plan
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded bg-gray-100">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${fillPct}%` }}
          aria-hidden="true"
        />
      </div>

      {isOver && (
        <p className="mt-2 text-xs text-red-700" data-testid="ai-usage-over-cap">
          Cap reached — AI replies are now using fallback templates.{' '}
          <a href="/app/settings/ai-usage" className="underline">
            See details
          </a>
          .
        </p>
      )}
      {isWarn && (
        <p className="mt-2 text-xs text-amber-700">
          Approaching cap — consider raising it before the month ends.
        </p>
      )}

      <p className="mt-3 text-xs">
        <a href="/app/settings/ai-usage" className="text-gray-600 underline hover:text-black">
          View full history →
        </a>
      </p>
    </div>
  );
}
