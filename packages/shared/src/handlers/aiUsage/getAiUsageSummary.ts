/**
 * Spec 019 / Phase 2.2 — read-only AI usage summary for the dashboard.
 *
 * Aggregates `aiUsage` rows for the current month + last N months.
 * Pure read; never writes. Lazy-handles the "no rows yet" case by
 * returning a synthetic zero row at the tenant's plan default cap.
 */
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
import { repo } from '../../db/repo.js';
import type { AiUsage } from '../../types/tenant.js';

// Plan-default caps in paise (mirrors generateAiReply.ts /
// classifyIntent.ts — the cap is copied onto each aiUsage row at
// creation time, so this is just for the synthetic "no row yet" case).
const DEFAULT_CAP_BY_PLAN: Record<string, number> = {
  free: 10_000, // ₹100/mo
  starter: 50_000, // ₹500/mo
  growth: 200_000, // ₹2,000/mo
  agency: 500_000, // ₹5,000/mo
};

export interface MonthlyUsage {
  month: string; // YYYY-MM
  inputTokens: number;
  outputTokens: number;
  costInr: number; // paise
  cap: number; // paise
  /** 0..999 — clamped so a buggy state doesn't render "1500%". */
  pctUsed: number;
  /** True if synthesised because no row exists for this month yet. */
  synthetic: boolean;
}

export interface AiUsageSummary {
  current: MonthlyUsage;
  history: MonthlyUsage[]; // newest first, current month not included
  plan: string;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Compute the YYYY-MM keys for the last `count` months EXCLUDING the
 * current month (current is returned separately as `current`).
 */
function previousMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function pctOf(used: number, cap: number): number {
  if (cap <= 0) return 0;
  const raw = Math.round((used / cap) * 100);
  return Math.max(0, Math.min(999, raw));
}

function rowToMonthly(row: AiUsage): MonthlyUsage {
  return {
    month: row.month,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costInr: row.costInr,
    cap: row.cap,
    pctUsed: pctOf(row.costInr, row.cap),
    synthetic: false,
  };
}

function syntheticMonthly(month: string, cap: number): MonthlyUsage {
  return {
    month,
    inputTokens: 0,
    outputTokens: 0,
    costInr: 0,
    cap,
    pctUsed: 0,
    synthetic: true,
  };
}

export interface GetAiUsageSummaryOpts {
  /** History months (excluding current). Default 6, max 24. */
  months?: number;
}

export async function getAiUsageSummary(
  ctx: Ctx,
  opts: GetAiUsageSummaryOpts = {},
): Promise<AiUsageSummary> {
  requireTenant(ctx);

  const months = Math.max(0, Math.min(24, opts.months ?? 6));

  // Read all aiUsage rows for this tenant scoped by repo. We pull a
  // generous limit (months + current = 25 max) and filter by the
  // computed key list afterwards — simpler than a IN-clause through
  // the StrictDB dynamic-dispatch boundary.
  const allRows = await repo.queryMany<AiUsage>('aiUsage', {}, ctx, { limit: 200 });

  // Resolve the tenant's plan for the default-cap fallback.
  const db = await getDb();
  const tenantRow = await db.queryOne<{ plan: string }>('tenants', {
    _id: ctx.tenantId,
  } as never);
  const plan = tenantRow?.plan ?? 'free';
  const defaultCap = DEFAULT_CAP_BY_PLAN[plan] ?? DEFAULT_CAP_BY_PLAN.free ?? 10_000;

  const byMonth = new Map<string, AiUsage>();
  for (const r of allRows) byMonth.set(r.month, r);

  const currentKey = currentMonthKey();
  const currentRow = byMonth.get(currentKey);
  const current = currentRow ? rowToMonthly(currentRow) : syntheticMonthly(currentKey, defaultCap);

  const history: MonthlyUsage[] = [];
  for (const key of previousMonthKeys(months)) {
    const row = byMonth.get(key);
    history.push(row ? rowToMonthly(row) : syntheticMonthly(key, defaultCap));
  }

  return { current, history, plan };
}

// ---- formatters used by the UI; exported for unit testing ----

/**
 * Convert paise (integer) → "₹1,234.56" string (Indian locale grouping).
 */
export function formatPaise(paise: number): string {
  const inr = paise / 100;
  // Hindi locale uses 1,00,000 grouping. Use 'en-IN' for the same
  // grouping with English digits.
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(inr);
  return `₹${formatted}`;
}

/**
 * Convert token count → "1,23,456" string (Indian locale grouping).
 */
export function formatTokens(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}
