# Spec 019 — AI Usage Dashboard

> **MDD phase:** Compressed (autonomy mode for Phase 2).
> **Implements:** Phase 2.2 of `docs/TODO_BUILD.md` — surface the
> per-tenant monthly AI spend that's already accumulating in
> `aiUsage` rows.

**Status:** In flight
**Branch:** `feat/phase2-2-ai-usage-dashboard`

---

## 1. Goal

Tenants on the dashboard see how much they've spent on AI replies +
intent classification this month, against their plan cap. After this
spec ships:

- Dashboard summary card shows "AI used this month: ₹X / ₹Y (Z%)" with
  a progress bar that turns amber at 80% and red at 100%.
- A full `/app/settings/ai-usage` page shows:
  - Current month: cost, tokens (input/output), cap, % used.
  - Last 6 months as a simple table (month, cost, tokens).
  - Per-tenant cap and a one-line explainer ("Defaults: Free ₹100, Starter ₹500, Growth ₹2,000, Agency ₹5,000").
- API endpoint `GET /api/v1/aiUsage` returns the same payload.

Backwards-compatible: existing `aiUsage` rows are read as-is. No schema
or migration change.

---

## 2. Out of scope

- **Per-automation breakdown** — `aiUsage` doesn't carry `automationId`.
  Adding it would need a schema change + handler edits in
  `generateAiReply` + `classifyIntent`. Deferred to a later spec.
- **Cap raises via UI** — tenants can email support; UI cap-edit is
  post-launch.
- **Real-time billing alerts** — the cap is enforced at the handler
  level (cap-exceeded → fallback). Email alerts at 80% / 100% land
  with spec 014 observability.
- **Charts / sparklines** — the table is functional. Chart libraries
  (recharts, etc.) add bundle weight; we'll add later if tenants ask.
- **Cross-tenant operator dashboard** — not needed in v1.

---

## 3. Architectural decisions

### 3.1 Read-only handler, no new collection

`getAiUsageSummary(ctx, { months })` reads from `aiUsage` via `repo`,
returns the current-month row plus the last N months. Pure aggregation;
no writes.

### 3.2 Default plan caps live in code, not DB

The `aiUsage.cap` column is per-row. When a row is auto-created by
`generateAiReply` / `classifyIntent` for a new month, the cap is read
from the tenant's plan (existing pattern, see `DEFAULT_CAP_BY_PLAN` in
those handlers).

This spec **doesn't add a new source of truth** for caps. The summary
endpoint just surfaces what's stored.

### 3.3 Lazy-create on read

If a tenant has never triggered an AI call this month, there's no
`aiUsage` row yet. The summary handler returns a synthetic
"current month, 0 used, default cap" object — no row is created on
read (avoids littering rows for inactive tenants).

### 3.4 Display format

Costs are stored in **paise** (1/100 INR) but rendered in INR with
₹-prefix and 2-decimal precision. Token counts are rendered with
`Intl.NumberFormat('en-IN')` for Indian-locale grouping (1,00,000
not 100,000).

### 3.5 No new env vars / dependencies

Pure SQL aggregation + React rendering. Zero infra additions.

---

## 4. Files to create / modify

### 4.1 Handler
- Create `packages/shared/src/handlers/aiUsage/getAiUsageSummary.ts`.
- Add to `packages/shared/package.json` exports map.

### 4.2 API
- Create `apps/web/app/api/v1/aiUsage/route.ts`.

### 4.3 UI
- Create `apps/web/components/dashboard/ai-usage-card.tsx` — Server
  Component, renders the summary card on the dashboard page.
- Create `apps/web/app/(app)/app/settings/ai-usage/page.tsx` — full
  page with current + last-6-months table.
- Modify `apps/web/app/(app)/app/dashboard/page.tsx` — drop in the
  `<AiUsageCard />` next to the existing counters.

---

## 5. Tests

### 5.1 Integration (`tests/integration/aiUsageSummary.test.ts`)
Gated on `hasInfra`.
- **AU1: zero-row tenant returns synthetic 0/cap** — fresh tenant, no `aiUsage` rows, summary returns `{ current: { used: 0, cap, pctUsed: 0 } }`.
- **AU2: existing row aggregates correctly** — seed `aiUsage` with `costInr=1000`, assert `used=1000`, `pctUsed = round(1000/cap * 100)`.
- **AU3: last 6 months ordered descending** — seed three months of rows, assert order.
- **AU4: cross-tenant isolation** — tenant A's summary excludes tenant B rows.

### 5.2 Unit
- Format helpers (`formatPaise`, `formatTokens`) get one test each.

### 5.3 E2E
- Skip — UI is read-only, integration tests cover the handler. The
  dashboard page already has E2E coverage from spec 011.

---

## 6. Acceptance criteria

- [ ] `getAiUsageSummary(ctx, { months: 6 })` returns expected shape.
- [ ] `GET /api/v1/aiUsage` returns the same shape; 401 unauthed.
- [ ] Dashboard summary card renders with correct numbers.
- [ ] Settings → AI usage page renders the 6-month table.
- [ ] All §5 tests pass.
- [ ] `pnpm smoke` green.
- [ ] CLAUDE.md "Lessons learned" updated.

---

## 7. Risks

1. **Tenants on Free tier with $0 cap** — DEFAULT_CAP_BY_PLAN has Free
   at ₹100, Starter ₹500. Display the cap as-is; if a tenant has a
   per-row override (cap was edited manually for a row), it's shown
   for that row.
2. **Negative or huge numbers from $inc bugs** — defensive: clamp
   pctUsed to [0, 999] before display so a buggy state doesn't render
   "1500%".
