# Spec 025 — Empty-state onboarding

> **MDD phase:** Compressed (Phase 4 autonomy mode).
> **Implements:** Phase 4.7 of `docs/TODO_BUILD.md` — replace bare
> "No X yet" copy with actionable guidance for first-time tenants.

**Status:** In flight
**Branch:** `feat/phase4-7-empty-states`

---

## 1. Goal

A first-time tenant lands on an empty dashboard. Today: empty counters
+ "No automations yet" / "No leads yet" / "No sends yet" copy. Net
effect: "ok... what now?".

After this spec ships:

1. **Dashboard** — when ANY of (IG accounts, automations, sends in 24h)
   are zero, render a step-by-step `<OnboardingChecklist />` above the
   counters. Each step links to the right page. Steps already complete
   get a green ✓ + a strikethrough; the next-incomplete step is
   highlighted.
2. **Automations page** — empty state shows three concrete example
   automations the tenant can copy as a template, plus the
   "Connect IG first" hint when no accounts exist.
3. **Leads page** — empty state explains how leads get captured (reply
   to a DM with email/phone) + links to the AI prompt examples.
4. **Sends page** — empty state explains "Sends are logged here once
   automations fire" + links back to /app/automations.

Pure UX. No schema, no migration, no API change.

---

## 2. Out of scope

- **Modal product tour** (clickable arrows pointing at UI elements) —
  too invasive; tenants who skip it never see the value.
- **Telemetry on which steps tenants complete** — lands with spec 014
  (PostHog).
- **Localised copy** — English only for v1, matching the rest of the
  dashboard.
- **Persisted "I dismissed the checklist" state** — the checklist
  auto-hides once all four steps are done; explicit dismiss adds
  state we don't need.

---

## 3. Architectural decisions

### 3.1 Server-rendered, data-driven

The checklist takes the same data the dashboard already fetches in its
`Promise.all`: `accounts`, `automations`, `sendCount`. No new fetches.
Each step's "completed" state is derived:

| Step | Completed when |
|---|---|
| 1. Connect Instagram | `accounts.length > 0` |
| 2. Create your first automation | `automations.items.length > 0` |
| 3. Test-fire it | (heuristic) `automations` exist AND any `sendCount > 0` OR a paused automation exists |
| 4. Watch leads roll in | `leadCount > 0` |

Step 3 is squishy (we don't track "did the tenant click Test Fire");
the proxy is "you've created an automation AND you have sends" — close
enough for a checklist nudge.

### 3.2 Auto-hide once everything is done

When all 4 steps are ✓, hide the checklist entirely. Tenants who
re-enter the dashboard later don't see stale onboarding. No dismiss
button, no localStorage flag.

### 3.3 Empty-state copy is contextual

Each empty state cites the prerequisite that's missing:

- `/app/automations` empty + 0 IG accounts → "Connect Instagram first."
- `/app/automations` empty + ≥1 IG account → "Create your first
  automation" + 3 example templates as quick-start cards.
- `/app/leads` empty → "Leads appear here when DM repliers volunteer
  email/phone."
- `/app/sends` empty → "Sends appear here when automations fire."

---

## 4. Files to create / modify

- `apps/web/components/dashboard/onboarding-checklist.tsx` — new
  Server Component.
- `apps/web/app/(app)/app/dashboard/page.tsx` — render the checklist
  when any step is incomplete.
- `apps/web/app/(app)/app/automations/page.tsx` — improve the empty
  state with example-template cards.
- `apps/web/app/(app)/app/leads/page.tsx` — improve the empty state.
- `apps/web/app/(app)/app/sends/page.tsx` — improve the empty state.

---

## 5. Tests

No unit tests — pure UI text. Existing E2E tests (dashboard, leads,
sends, automations) still pass because the empty-state copy is hit
only when the corresponding data is empty; tests that seed data go
through the populated path.

If a future test asserts on empty-state copy specifically, it lands
in a follow-up E2E spec.

---

## 6. Acceptance criteria

- [ ] OnboardingChecklist renders when any of 4 steps is incomplete.
- [ ] OnboardingChecklist is hidden when all 4 steps are ✓.
- [ ] Each empty state on automations / leads / sends has actionable
      copy + a link to the right next page.
- [ ] `pnpm smoke` green.
