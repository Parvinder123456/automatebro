# TODO — What's left to build

> Source of truth for outstanding work. Updated after every shipped phase.
> When `engineering-plan.md`, this file, and the relevant `docs/specs/NNN-*.md`
> conflict, the spec wins for in-progress work and `engineering-plan.md` wins
> for the v1 contract.

**Last updated:** 2026-05-05
**Branch in flight:** none — Phase 1 complete, Phase 2.2 shipped. Master is at the latest deployed state.

---

## ✅ Already shipped (live on `master`, deployed via Vercel + Railway)

| Capability | Where |
|---|---|
| Email + password auth, multi-tenancy, ctx-from-session | specs 001–003 |
| Meta OAuth, encrypted tokens, webhook ingestion (HMAC + idempotent) | specs 004–005 |
| BullMQ worker queue + per-account rate limiter | spec 006 |
| Comment-to-DM automations (static templates) | spec 007 |
| AI replies (gpt-4o-mini, moderation, cost cap) | spec 008 |
| Lead capture inside DMs + CSV export | spec 009 |
| Dashboard UI (sidebar, automations, leads, sends, settings) | spec 011 |
| Marketing site `/`, `/pricing`, `/compare/*` | spec 012 |
| DPDP / privacy export + delete + consent gates | spec 013 |
| **DM-keyword automation** (Phase 1.1) | spec 015 |
| **AI intent classifier + smart-trigger gate** (Phase 1.2) | spec 016 |
| **Real Instagram post picker** (Phase 1.3) | spec 017 |
| **Story-reply automation** (Phase 1.4 — code live, App-Review gated) | spec 018 |
| **AI usage dashboard** (Phase 2.2) | spec 019 |
| Migration runner env-isolation (admin-tool fix) | `1a5254b` |

---

## ❌ Outstanding — prioritised

### Phase 1 — Trigger parity with LinkPlease + AI moat

| # | Item | Status | Risk | Notes |
|---|---|---|---|---|
| 1.1 | **DM-keyword automation** ("user DMs you") | ✅ live on master | Low | Spec 015 — `'dm'` trigger enum, migration 009 applied, `processDmEvent` parallel-dispatch with `captureLead`, UI radio option. |
| 1.2 | **AI sentiment / intent classifier** | ✅ live on master | Low | Spec 016 — gpt-4o-mini classifier on inbound, persisted on `events.intent`, optional `triggers.intents` gate. Confidence floor 0.5. Cap-aware. UI multi-select shipped. Migration 010 applied. |
| 1.3 | **Real post picker** | ✅ live on master | Med | Spec 017 — `GET /api/v1/igAccounts/[id]/media` paginated, thumbnail-grid modal in automation form. Cache-injection seam ready (no-op default; Phase 2 wires Redis). |
| 1.4 | **Story-reply automation** | 🟡 code live, gated on Meta App Review | High | Spec 018 — `processStoryReplyEvent` shipped, dispatcher branch wired, eventId synthesis tags `reply_to.story` as `kind='storyReply'`. UI radio kept disabled with "Beta — pending Meta approval" hint. Auto-enables when Meta grants `instagram_manage_messages` and `messages` is added to `WEBHOOK_FIELDS`. |

### Phase 2 — Revenue + retention (gated on Razorpay KYC)

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Razorpay billing | ❌ KYC blocked | Spec 010 — checkout, subscription webhook, plan-tier enforcement, dunning. |
| 2.2 | AI usage dashboard | ✅ live on master | Spec 019 — `getAiUsageSummary` handler, `GET /api/v1/aiUsage`, dashboard summary card + full `/app/settings/ai-usage` page with 6-month history. INR formatting uses Indian-locale grouping (1,00,000). |
| 2.3 | Pagination + sortable tables | 🟡 pagination ✅ live, sortable columns deferred | Spec 020 — `paginate()` helper, `Paginated<T>` shape, `?page=N&pageSize=M` query params on `/api/v1/{automations,leads,sends}`, Prev/Next URL-driven UI on all three list pages. Sortable column headers deferred to a v1.3 polish pass — current sorts are still fixed (createdAt desc / lastSeenAt desc / queuedAt desc). |

### Phase 3 — Differentiation

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | AI follow-up sequences | ❌ depends on 2.1 + 2.4 | Drip DMs N hours after no-reply. Needs scheduled-job cron (spec 014). |
| 3.2 | Multilingual replies (Hindi + English + Hinglish) | ✅ live on master | Spec 021 — system-prompt instruction "reply in SAME language as user". Auto-detects English / Devanagari Hindi / Hinglish; falls back to English for other languages. Snapshot-tested. |
| 3.3 | Webhook-out integration | ❌ pending | Forward leads / sends to tenant's own endpoint with HMAC-signed payloads. |
| 3.4 | Mailchimp lead push | ❌ pending | OAuth + list-add. |
| 3.5 | Google Sheets append | ❌ pending | OAuth + append-row. |

### Phase 4 — Post-launch polish

| # | Item | Status | Notes |
|---|---|---|---|
| 4.1 | Live-comments automation | ❌ pending | Meta `comments` field includes Live; just needs differentiation in `processEvent` + UI option. |
| 4.2 | Story-mentions automation | ❌ pending | Schema enum has `mention`. Same App Review gate as 1.4. |
| 4.3 | AI-suggested automations | ❌ pending | "We saw 12 pricing-intent comments this week, want to auto-DM your pricing PDF?" |
| 4.4 | Tag editing UI for leads | ❌ pending | Schema supports `tags[]`; no UI. |
| 4.5 | Test-fire button on automations | ✅ live on master | Spec 022 — `previewAutomation` handler (pure dry-run, no send / AI / DB write), `POST /api/v1/automations/[id]/preview`, modal opened from row-actions. AI mode shows fallback template (real AI is runtime-only). |
| 4.6 | Copy-automation duplication | ✅ live on master | Spec 023 — `duplicateAutomation` handler clones trigger + response transactionally with new UUIDs, defaults to status='paused', name suffix "(copy)". `POST /api/v1/automations/[id]/duplicate` accepts optional igAccountId override (cross-tenant verified). "Duplicate" button in row-actions. |
| 4.7 | Empty-state onboarding tour | ❌ pending | "You have 0 automations — here's how to make your first one." |
| 4.8 | Inline editing on tables | ❌ pending | Currently every mutation goes through a dedicated form page. |

### Phase 5 — Platform plumbing (still missing)

| # | Item | Status | Notes |
|---|---|---|---|
| 5.1 | Spec 014 — Sentry / Axiom / Better Stack wiring | ❌ pending | Plus the 30-day hard-delete cron and AI follow-up scheduler. Blocked on domain registration. |
| 5.2 | Meta App Review submission | ❌ pending | 4–8 week timeline for `instagram_manage_messages` + `instagram_manage_comments`. Required for production traffic beyond whitelisted test users. |
| 5.3 | Resend transactional SMTP | ❌ pending | Today password resets use Supabase's rate-limited dev SMTP. ~30 min wiring. |
| 5.4 | Apply migration 008 to live Supabase | ❌ pending | `pnpm db:migrate` after `META_IG_APP_SECRET` is added to `.env`. |
| 5.5 | Domain `automatebro.com` registration | ❌ pending | Required for Resend DKIM/SPF/DMARC + production webhook URL. |

---

## Pre-launch hard requirements

Before private-beta launch, **all** of the following must be true:

1. Meta App Review approves `instagram_manage_messages` + `instagram_manage_comments`.
2. Razorpay KYC complete; production keys + webhook URL wired.
3. `automatebro.com` registered + DNS configured for Resend.
4. Migration 008 applied; `META_IG_APP_SECRET` set on Vercel + Railway.
5. Spec 014 observability + cron live (Sentry + Axiom + Better Stack + hard-delete cron).
6. At least one E2E run against production-mode infra has passed end-to-end (signup → connect IG → automation → real Meta event → DM sent).

Anything in Phase 3+ is post-launch.

---

## How to use this doc

- **When you ship something:** move it from outstanding → "already shipped" with the spec / branch reference. Date the change.
- **When you find new work:** add it to the right Phase. Don't create a new doc — this is the one place.
- **When you re-prioritise:** swap items between Phases. Don't delete; mark "deprioritised" with rationale.
- **When you start a Phase item:** create a `docs/specs/NNN-<slug>.md` and update "Branch in flight" at the top.
