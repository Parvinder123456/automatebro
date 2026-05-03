# Spec 011 — Dashboard UI

> **MDD phase:** Document → Test → Code.
> **Implements:** §Appendix B item 11 of `docs/engineering-plan.md` —
> "automation builder UI, send history, leads view".

**Status:** Awaiting approval — no code yet
**Branch:** `claude/hungry-hypatia-f45fa1`

---

## 1. Goal

Replace the placeholder `/app/dashboard` with a working tenant dashboard that
surfaces the API endpoints already shipped in specs 003–009. After this spec
ships, a logged-in tenant can:

1. **See an at-a-glance summary** of their workspace on `/app/dashboard`
   (counts: active automations, connected IG accounts, leads, sends in last
   24 h).
2. **Create, edit, pause, archive, and delete automations** through a
   form-based UI at `/app/automations`.
3. **View captured leads** at `/app/leads` and download them as CSV.
4. **Inspect outbound DM history** at `/app/sends` filtered by status.
5. **Navigate** between Dashboard, Automations, Leads, Sends, Integrations
   via a persistent sidebar.

All UI lives at `/app/*` inside `apps/web`. Per engineering plan §3 the dev
port is 3002 (`pnpm dev:dashboard`) but in production it's the same Next.js
deployment as the rest of the site.

---

## 2. Out of scope

- Pricing / Razorpay / plan-tier UI (lands in spec 010).
- AI cost / usage dashboard with per-tenant spend graph (spec 014 observability).
- Privacy / DPDP export + delete UI (spec 013).
- Visual flow builder à la ManyChat — engineering plan §2 explicitly bans this
  for v1; we ship a form-based automation builder only.
- Pagination on tables — v1 uses fixed limits (`100` automations, `1000`
  leads, `1000` sends, matching the existing API caps). If a tenant
  exceeds these we cross that bridge then.
- Sortable / filterable columns — list is fixed by recency. One status
  filter on `/app/sends` (the API already accepts `?status=`).
- Inline editing — every mutation goes through a dedicated form page.
- Rich post-picker that calls Meta Graph for the user's posts — `postIds`
  is a textarea of newline-separated IDs in the form (same shape as the
  Zod schema accepts). Real picker is a post-launch UX upgrade.
- Empty-state onboarding tours, animations, drag-and-drop.
- Any UI for editing `igAccountId` on an existing automation (treat it as
  immutable; if a tenant wants to switch accounts, delete + re-create).
- Any new business logic in `packages/shared/src/handlers/` **beyond one
  helper:** a new `listSends` handler + `GET /api/v1/sends` route, because
  no list endpoint for sends currently exists.

---

## 3. Architectural decisions

### 3.1 Server Components by default; client components only for forms

Every page is a Server Component that calls the existing handlers
(`listAutomations`, `listLeads`, `listSends`, `listIgAccounts`) directly via
`getCtx()`. Forms need interactivity (validation, disable-while-submitting,
hydration sentinel) so the form bodies are Client Components, but their
host pages stay server-rendered.

Match the pattern already used in
[apps/web/app/(app)/app/integrations/page.tsx](apps/web/app/(app)/app/integrations/page.tsx)
and [apps/web/app/(auth)/login/page.tsx](apps/web/app/(auth)/login/page.tsx).
No SWR / React Query / TanStack — vanilla `fetch` from client components, RSC
data-loading on initial render.

### 3.2 Mutations: client `fetch` to existing API routes (no Server Actions)

Existing routes (`POST /api/v1/automations`, `PATCH /api/v1/automations/[id]`,
`DELETE /api/v1/automations/[id]`) accept JSON. Client form components
serialise `FormData` → JSON, `fetch` the route, then `router.refresh()` (or
`router.push`) on success.

We considered Next.js Server Actions. Rejected because:
- The API routes already exist and are exercised by integration tests.
- Server Actions encourage skipping the API layer; we'd lose the symmetry
  of "everything you can do in the UI you can do via the public API."
- Per CLAUDE.md "Don't add features beyond what the task requires."

### 3.3 Sidebar layout via the existing `(app)/layout.tsx`

The current `(app)/layout.tsx` (spec 003) is a tenant gate — it redirects
without rendering chrome. Spec 011 keeps the gate logic and *adds* a sidebar
+ main-content shell when the gate passes. Onboarding (`/onboarding`) keeps
its own bare layout (no sidebar) — branch on `pathname === '/onboarding'`.

Sidebar links (in order): Dashboard, Automations, Leads, Sends, Integrations,
Sign out (form posting `/logout`). Active link highlighted by comparing
`pathname` to the link's `href` prefix.

### 3.4 New: `listSends` + `GET /api/v1/sends`

The `sends` collection has no list handler yet. Add:

- `packages/shared/src/handlers/sends/listSends.ts` —
  `listSends(ctx, { igAccountId?, status?, automationId?, limit? })`.
  Defaults: `limit=1000`, sort by `queuedAt DESC`. Uses `repo.queryMany`.
- `apps/web/app/api/v1/sends/route.ts` — `GET` endpoint, same auth pattern
  as `/api/v1/automations` (401 on no session, 400 on no tenant). Query
  params map 1:1 to the handler options.

### 3.5 Form validation: Zod on client + server, same schema

Import `CreateAutomationInput` / `UpdateAutomationInput` from the shared
package directly into the Client Component for client-side validation
before fetch. Server-side validation in the route handler is unchanged.
One vocabulary, one source of truth.

### 3.6 Hydration sentinel on every form

Per spec 005 lessons: `data-hydrated="true"` set in `useEffect`, submit
button disabled until hydrated. Playwright tests await
`toHaveAttribute('data-hydrated', 'true')` before fill+click. This is
non-negotiable — without it dev-mode E2E tests submit before React mounts.

### 3.7 No shadcn install in this spec

The starter kit profile mentions shadcn but the project has not pulled in
the shadcn CLI yet (no `components/ui` folder, no `components.json`). Per
CLAUDE.md "Don't add features beyond what the task requires" — we ship
Tailwind primitives. If a future spec needs `<Dialog>` / `<Select>`, add
shadcn then.

### 3.8 Confirm-delete via `window.confirm`

Spec 011 uses native `window.confirm()` for the "Delete this automation?"
prompt. It's three lines vs. ~50 lines of dialog plumbing, and good enough
for v1. Replace with shadcn `<AlertDialog>` if and when shadcn lands.

### 3.9 No client-side state library

`useState` / `useTransition` are sufficient. Zustand / Jotai / Redux are
not needed for this surface area.

### 3.10 Style: same Tailwind primitives as `/app/integrations`

Match the existing visual language: `mx-auto max-w-3xl p-8`, `rounded
border`, `text-sm text-gray-600`, `bg-black px-5 py-2 text-white` for
primary actions. No design-system rewrite in this spec.

---

## 4. URL surface

| Path | Method | Component | Purpose |
|---|---|---|---|
| `/app/dashboard` | GET | Server Component | Summary cards |
| `/app/automations` | GET | Server Component + client list | List + pause/delete actions |
| `/app/automations/new` | GET | Server Component + client form | Create form |
| `/app/automations/[id]` | GET | Server Component + client form | Edit form |
| `/app/leads` | GET | Server Component | Lead table + CSV download link |
| `/app/sends` | GET | Server Component | Send history table |
| `/app/integrations` | GET | (existing — unchanged) | IG account connect |
| `/api/v1/sends` | GET | route.ts | New: list sends — used internally by `/app/sends` SSR |

No new mutations — uses the existing `/api/v1/automations` POST/PATCH/DELETE.

---

## 5. Data flow per page

### 5.1 `/app/dashboard`

Server Component runs four queries in parallel via `Promise.all` (per CLAUDE.md
Rule #8):
1. `listAutomations(ctx)` → count where `status === 'active'`.
2. `listIgAccounts(ctx)` → length.
3. `listLeads(ctx, { limit: 1 })` → `repo.count('leads', {}, ctx)` — actually
   replace with a dedicated `count` so we don't fetch 1k rows for a number.
   New helper: `countLeads(ctx)`.
4. `countSendsLast24h(ctx)` — new helper using `repo.count` with
   `{ queuedAt: { $gte: <24h ago> } }`.

Render four `<div class="rounded border p-6">` cards in a 2×2 grid.

### 5.2 `/app/automations`

Server Component calls `listAutomations(ctx)`. Renders a table (one row per
automation): name, IG account username, trigger, status badge, keyword count,
"Edit" link, "Pause/Resume" client button, "Delete" client button.

The Pause/Resume + Delete buttons live in a small Client Component
[apps/web/components/automations/row-actions.tsx] that calls
`PATCH /api/v1/automations/[id]` and `DELETE /api/v1/automations/[id]`
respectively, then `router.refresh()`.

Empty state: "No automations yet — create your first one →".

### 5.3 `/app/automations/new`

Server Component fetches `listIgAccounts(ctx)` to populate the
`<select>` for `igAccountId`. The page renders a Client Component
`<AutomationForm mode="create" igAccounts={...} />`.

Form sections:
1. **Basics** — name, IG account select, trigger select (comment / storyReply
   only — `mention` accepted by schema but disabled in UI per engineering
   plan §1 "v1 ships comment + story-reply").
2. **Trigger** — keywords textarea (newline-separated, mapped to `string[]`),
   match mode radio (`contains` / `exact` / `startsWith`), postIds textarea
   (newline-separated, optional — empty = all posts).
3. **Response** — mode radio (`static` / `ai`).
   - If `static`: template textarea (required, supports `{firstName}`).
   - If `ai`: aiPrompt textarea, aiTone select, fallbackTemplate textarea.
   - Optional: commentReply textarea (used in §3 of engineering plan §6).
4. **Submit** — disabled until hydrated; shows inline errors from server
   400 response.

### 5.4 `/app/automations/[id]`

Same form, mode="edit", pre-populated from `listAutomations(ctx)` finding
the matching automation. Submit `PATCH`s. `igAccountId` field is read-only
(per §3 decision).

### 5.5 `/app/leads`

Server Component calls `listLeads(ctx, { limit: 1000 })`. Renders a table:
IG username, IG user ID, email, phone, first seen, last seen, tags.

Top-right: a `<a href="/api/v1/leads?format=csv" download>` link styled as a
button. The route already sets `Content-Disposition: attachment`.

### 5.6 `/app/sends`

Server Component calls `listSends(ctx, { status })` where `status` comes
from a `?status=` query param. Renders a table: IG account, automation
name (lookup), recipient PSID, kind, status badge, error code (if failed),
queued at, sent at.

Top: a small filter row with `<a>` links — All / Sent / Failed / Rate-limited
/ Outside-window — each link sets `?status=…`.

---

## 6. New code surface

```
packages/shared/src/handlers/sends/
├── listSends.ts              # NEW
├── countSendsLast24h.ts      # NEW (used by dashboard)
└── (existing sendDM stays in handlers/ root, untouched)

packages/shared/src/handlers/leads/
└── countLeads.ts             # NEW (used by dashboard)

packages/shared/package.json   # exports map: add the three new handler files

apps/web/app/api/v1/sends/
└── route.ts                  # NEW — GET handler

apps/web/app/(app)/app/
├── dashboard/page.tsx        # REWRITE (currently a placeholder)
├── automations/
│   ├── page.tsx              # NEW
│   ├── new/page.tsx          # NEW
│   └── [id]/page.tsx         # NEW
├── leads/page.tsx            # NEW
└── sends/page.tsx            # NEW

apps/web/app/(app)/layout.tsx # MODIFY — add sidebar shell when not on /onboarding

apps/web/components/
├── app-shell/
│   ├── sidebar.tsx           # NEW — Server Component, reads pathname
│   └── nav-link.tsx          # NEW — Client Component for active highlighting
├── automations/
│   ├── automation-form.tsx   # NEW — Client Component (create + edit)
│   ├── row-actions.tsx       # NEW — Client Component (pause/delete)
│   └── status-badge.tsx      # NEW — Server Component
└── sends/
    └── status-filter.tsx     # NEW — Server Component (just <a> tags)
```

Roughly **11 new TSX files + 3 shared handlers + 1 API route + 2 modified
files (layout + dashboard).** Each file kept under 300 lines per CLAUDE.md
Rule #7.

---

## 7. Tests (write FAILING first per MDD)

### Unit (Vitest)

- `packages/shared/src/handlers/sends/listSends.test.ts` —
  - filters by status correctly
  - filters by automationId correctly
  - default limit 1000, max 5000
  - tenant scoping enforced (cross-tenant query returns nothing — uses repo)
- `packages/shared/src/handlers/sends/countSendsLast24h.test.ts` —
  - counts only rows with `queuedAt >= now - 24h`
  - tenant-scoped
- `packages/shared/src/handlers/leads/countLeads.test.ts` — tenant-scoped count.

(Skipped on environments without `STRICTDB_URI`, like our other integration
tests — see spec 003 lessons.)

### E2E (Playwright)

`tests/e2e/dashboard.spec.ts` — six scenarios:

1. **Sidebar renders for logged-in tenant.**
   - Assertions: URL `/app/dashboard`, sidebar visible, all 5 nav links
     visible, active link is "Dashboard".

2. **Create automation → appears in list.**
   - Login → `/app/automations/new` → fill form (with hydration await) →
     submit → assert URL is `/app/automations`, the new row is in the
     table, status badge shows "Active".

3. **Edit automation → updated values render.**
   - Click "Edit" on the new row → change name → submit → assert
     URL `/app/automations`, new name visible, status unchanged.

4. **Pause toggles status badge.**
   - Click "Pause" → assert badge text changes to "Paused" without page
     reload (router.refresh).

5. **Delete removes the row.**
   - Click "Delete", confirm via `page.on('dialog', d => d.accept())` →
     assert row no longer present, empty-state visible.

6. **CSV download from /app/leads.**
   - Navigate to `/app/leads` → click CSV button → assert download
     starts with content-type `text/csv` and `Content-Disposition`
     filename matches `leads-YYYY-MM-DD.csv`.

7. **Sends page status filter.**
   - Seed 2 sends (one `sent`, one `failed`) → navigate to
     `/app/sends?status=failed` → assert only the failed row is visible
     and "Failed" link is the active filter.

Per CLAUDE.md, MINIMUM 3 assertions per test (URL + visibility + content).
`fullyParallel: false`, single worker (existing config).

### Why no test for the dashboard summary cards specifically

Numbers come from `repo.count` calls — covered transitively by the
list-handler tests. Adding a dedicated dashboard test would re-test
counting through the UI; not worth the maintenance.

---

## 8. MDD plan (named steps)

| Step | Name | What |
|---|---|---|
| 1 | **Test scaffolding** | Write 3 Vitest test files + 1 Playwright spec file. All FAIL — no implementation yet. |
| 2 | **Approval gate** — show failing tests; wait for approval before code. |
| 3 | **Shared handlers** | `listSends`, `countSendsLast24h`, `countLeads`. Add to shared `package.json` exports. Tests go green. |
| 4 | **API route** | `apps/web/app/api/v1/sends/route.ts`. |
| 5 | **App shell** | Modify `(app)/layout.tsx` to add the sidebar (skip on /onboarding). Implement `sidebar.tsx` + `nav-link.tsx`. |
| 6 | **Dashboard page** | Rewrite `/app/dashboard` with summary cards. |
| 7 | **Automations list** | `/app/automations/page.tsx` + `row-actions.tsx` + `status-badge.tsx`. |
| 8 | **Automation form** | `automation-form.tsx` (Client Component) + create page + edit page. |
| 9 | **Leads page** | `/app/leads/page.tsx` + CSV button. |
| 10 | **Sends page** | `/app/sends/page.tsx` + `status-filter.tsx`. |
| 11 | **Run all tests** | Unit + E2E. All green. |
| 12 | **Code-review subagent** | Apply must-fixes. |
| 13 | **Approval gate** — show diff. |
| 14 | **Commit** | Single commit `feat(dashboard): spec 011 — automations / leads / sends UI`. |
| 15 | **Update CLAUDE.md** | Append "Spec 011 lessons" section if anything surprising surfaced. |

Steps 2 and 13 are **STOP gates**.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Form complexity blows past 300 lines | Split per §3.10 — `automation-form.tsx` is ~250 lines; if it grows, extract `<ResponseFields>` and `<TriggerFields>` sub-components. |
| `router.refresh()` doesn't pick up new automation in dev because of stale Next data cache | Add `export const dynamic = 'force-dynamic'` on each `/app/*` page (we already use this on API routes). |
| Tests flaky on Windows | Existing pattern — hydration sentinel + `fullyParallel: false` (per spec 005 lessons). |
| Browsing to `/app/automations` before tenants have any IG accounts crashes | New page must handle empty `listIgAccounts` — show "Connect Instagram first →" linking to `/app/integrations`. |
| Confirm-delete fires double on Enter | Use `<button type="button">` + `onClick` (not form submit) for the destructive actions. |

---

## 10. Lessons-learned section (placeholder)

To be appended to `CLAUDE.md` after the spec ships, under
`### Spec 011 lessons (YYYY-MM-DD)`. Likely topics: Next 15 RSC
data-loading patterns, Tailwind sidebar layout pitfalls, anything
surprising about `router.refresh()` cache behaviour.

---

**END OF SPEC — STOP and wait for approval before writing any tests or code.**
