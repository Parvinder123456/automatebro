# Spec 026 — WhatsApp Foundation

> **MDD phase:** Document → Test → Code (awaiting user approval before any code).
> **Implements:** First slab of WhatsApp automation. Foundation only — sets up
> connection, receive, send, basic automation, templates, cost tracking. Cross-
> platform features (IG → WA bridge, unified inbox, drip campaigns) come in
> follow-up specs.

**Status:** Awaiting approval — no code yet
**Branch:** `docs/spec-026-whatsapp-foundation` (this branch — docs only)
**Implementation branch (next):** `feat/spec-026-whatsapp-foundation`

> Spec 010 (billing), 014 (observability), 017 (story-reply, App-Review-gated),
> 018 (story mention), 020 (pagination), 022 (multilingual), 023-025 (lead tags,
> test-fire, duplicate, onboarding) are accounted for in TODO_BUILD.md. WhatsApp
> jumps to 026 to keep numbering linear and signal a category boundary —
> everything 026+ touches the WhatsApp surface area.

---

## 1. Goal

Tenants can connect their own WhatsApp Business Account to BloomDM, receive
incoming WhatsApp messages, send freeform replies inside the 24-hour service
window, send template messages outside it, and configure keyword-triggered
auto-reply automations — all without affecting any existing IG functionality.

After this spec ships:

- Tenant signs into the dashboard, clicks **Connect WhatsApp** on a new
  `/app/whatsapp` page, completes Meta's Embedded Signup flow, and lands back
  with their phone number connected and a confirmation banner.
- A user messages the tenant's WhatsApp Business number ("Hi, what's the price?").
- BloomDM receives the webhook, dedupes by `wamid`, persists the event,
  matches it against the tenant's automations, and enqueues a send.
- Worker picks up the send job, checks the 24-hour service window, sends a
  freeform reply via Meta Cloud API, records the send.
- A `sends` row is created with `channel='whatsapp'` and `kind='whatsappFreeform'`,
  status flowing `queued → sent` (or `failed | rateLimited | outsideWindow`).
- Tenant can author a template ("ORDER_CONFIRMATION"), submit it for Meta
  approval, see status updates, and use it in a future automation reply.
- The dashboard shows month-to-date WhatsApp conversations broken down by
  category (service / utility / marketing / authentication) plus an estimated
  ₹ cost.

**Existing IG functionality is unchanged. Zero behavioral changes to comment-to-DM,
DM-to-DM, story replies, lead capture, or any existing dashboard page.**

---

## 2. Out of scope

The following are deliberately deferred — each gets its own spec.

- **IG → WhatsApp bridge** — the strategic differentiator (capture phone in IG
  DM → opt in via WA template → continue conversation on WA). Spec 028.
- **Cross-platform unified inbox** — single thread view showing IG + WA messages
  for the same lead. Spec 029.
- **Multi-step WhatsApp drip flows** — "send template, wait 24h, send follow-up
  if no reply". Spec 030.
- **Voice note replies** — auto-reply with a voice note (ElevenLabs voice clone).
  Spec 031.
- **WhatsApp catalog / commerce** — shop, cart, UPI deep-link checkout. Spec 032.
- **Interactive templates with buttons / lists** — v1 supports text-only template
  bodies. Buttons + list-pickers + media headers come in spec 027.
- **Per-tenant phone number provisioning by BloomDM** — tenants bring their own
  WABA via Embedded Signup. We do not vend or resell numbers in v1.
- **Quality rating / tier-graduation surfacing** — Meta auto-graduates tier 1
  → 2 → 3 → 4 based on quality. We respect Meta's rate-limit responses but
  don't surface tier or quality rating in the UI in v1.
- **Sandbox / test number** — every tenant's WABA is real-mode from connection.
  No sandbox mode in BloomDM (Meta's own sandbox phone is for engineering work
  only).

---

## 3. Architectural decisions

### 3.1 Webhook isolation: new endpoint, no change to `/api/v1/webhooks/meta`

WhatsApp webhooks are configured separately in the Meta App dashboard (under
the **WhatsApp** product, not Instagram). They land at a different URL we
specify. **We use a separate route handler:**

```
POST /api/v1/webhooks/whatsapp
GET  /api/v1/webhooks/whatsapp     ← challenge handshake on subscribe
```

This is the single biggest "no impact on existing implementation" decision.
The existing `/api/v1/webhooks/meta` handler stays byte-identical. WhatsApp
gets its own file, its own parser, its own dispatcher.

Trade-off considered: Meta's webhook payload root has `object: 'instagram'` /
`object: 'page'` / `object: 'whatsapp_business_account'`. We *could* dispatch
inside one handler. Rejected because (a) increases the change footprint of the
existing handler, (b) any bug in WA parsing risks crashing IG processing, (c)
Meta lets us configure separate URLs anyway, so there's no operational benefit
to colocating.

Signature verification uses **the same `META_APP_SECRET`** because the
WhatsApp product lives under the same Meta App. No new env var needed. The
webhook verification logic is identical to IG (HMAC-SHA256 over raw body) —
we lift `verifyMetaSignature()` into a shared util if it isn't already.

### 3.2 New collections, no edits to existing collections (schema-side)

| New collection | Purpose | Indexed on |
|---|---|---|
| `whatsappAccounts` | Connected WABA per tenant. Phone number ID, WABA ID, encrypted system-user access token, display phone number, business name, status. | `(tenantId, status)`, unique on `phoneNumberId` |
| `whatsappTemplates` | Template definitions + Meta approval status. | `(tenantId, status)`, unique on `(tenantId, name, language)` |
| `whatsappCosts` | Per-tenant per-month aggregate of conversations by category. Mirror of `aiUsage`. | unique on `(tenantId, month)` |

Existing collections get **additive** schema changes only — no field renames,
no field removals, no semantic shifts:

| Existing collection | Additive change | Reason |
|---|---|---|
| `events.kind` enum | Add `'whatsappMessage'`, `'whatsappStatus'`, `'whatsappTemplateStatus'` | New event sources |
| `automations.trigger` enum | Add `'whatsappMessage'` | New automation trigger type |
| `sends.channel` (or equivalent existing field; if absent, add a new column) | Add `'whatsapp'` value or column | Distinguish IG sends from WA sends |
| `sends.kind` enum | Add `'whatsappFreeform'`, `'whatsappTemplate'` | Two send modes |
| `leads` | Add `whatsappPhone` (nullable, indexed) + `whatsappOptInAt` (timestamp) + `whatsappOptOutAt` + `whatsappAccountId` (FK) + `lastWhatsappInboundAt` (for service-window check) | Cross-channel lead identity + opt-in proof + window math |

All migrations are `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` /
`DROP CONSTRAINT … ADD CONSTRAINT …` so re-runs are safe (per CLAUDE.md §12.1).

### 3.3 Per-tenant WABA via Embedded Signup, not a shared platform number

Each tenant connects their own WhatsApp Business Account using Meta's
**Embedded Signup** flow (similar to Facebook Login for Pages). No tenant
shares a number with another tenant.

Why:
- **Branding.** Tenants want their own brand on outgoing messages, not "BloomDM".
- **Risk isolation.** A WhatsApp policy violation (e.g. spammy templates) gets
  the violating tenant's WABA suspended — not the platform's.
- **Cost attribution.** Each tenant's conversations bill against their own
  WABA. We track and surface costs but Meta bills tenants directly for
  enterprise tiers (small users use the 1K free tier).
- **Long-term correctness.** Reselling numbers is a different business
  (Twilio / Plivo). Not BloomDM's lane.

The user's already-connected WhatsApp number on the same Meta app stays
useful for **engineering / dev / smoke testing**, not as the production
tenant-facing surface. Document it in `.env.example` as `WHATSAPP_DEV_PHONE_ID`
with a comment that it's for local dev only.

### 3.4 24-hour service window enforced at send time, not at trigger time

WhatsApp's 24-hour rule:
- An incoming message from a customer opens a 24-hour "service conversation"
  window during which the business can send freeform replies.
- After 24 hours, the business can only send pre-approved **template messages**.
- Any send attempt outside the window without a template is rejected by Meta
  with error 131047.

We enforce this on the **send job** (not at automation-trigger time), because:
- Trigger fires when a message arrives — you're always in-window at trigger.
- The job may sit in queue (rare, but possible during retries / backoff).
- The customer's last-inbound time can change between trigger and send (unlikely
  but possible in multi-message bursts).

Implementation:
- Persist `lastWhatsappInboundAt` on the `leads` row whenever an inbound WA
  message lands.
- In `sendWhatsappMessage`, before calling Meta, query the lead. If
  `now - lastWhatsappInboundAt > 24h` AND the response doesn't have a
  template → mark the send as `status='outsideWindow'`, do not call Meta,
  return.
- If the response has a template → send as template regardless of window.
- If no lead row exists for this phone yet (never messaged us) → cannot send
  freeform, must use template.

### 3.5 Rate limiting: per-WhatsApp-number sliding window in Redis

Same pattern as the per-IG-account 185/hr limiter (spec 007). New Redis key
namespace `ratelimit:wa:<phoneNumberId>`. Default cap **1000 conversations / 24h**
matching Meta's tier-1 default. Configurable per-account via the
`whatsappAccounts.rateLimit` field (set on connection by reading Meta's
quality / tier API at signup; refresh nightly via cron).

Rejected: BullMQ Pro's groupKey limiter — same Pro-only restriction we hit on
IG, OSS BullMQ doesn't support per-key. Sliding window in Redis works.

### 3.6 Cost tracking: increment per successful conversation, not per message

WhatsApp bills per **conversation**, not per message. A conversation is a
24-hour block opened by:
- A customer message → "service" category (first 1000/month free in India)
- A business-initiated template → category determined by template (marketing /
  utility / authentication)

Within a conversation, all messages are free.

Our cost accounting:
- On a successful template send, increment
  `whatsappCosts.conversationsByCategory[<template.category>]` by 1.
  - Only on FIRST template send within a 24h window for that recipient. If
    multiple templates fire in the same 24h window, only count the first.
  - Mechanism: track `lastTemplateConversationOpenedAt[<recipientPhone>]` on
    the lead row. If within 24h, don't increment.
- On a successful freeform reply that's the first reply after a customer
  message in a fresh window, increment `service` count.

We do NOT compute INR cost live — we record conversation counts and the
dashboard multiplies by Meta's published rates (kept as a constant in
`packages/shared/src/whatsapp/rates.ts`, updated when Meta publishes new
prices). This separates pricing changes from data collection.

### 3.7 Templates: Meta approval is async, surface status clearly

Templates have lifecycle: `draft → pending → approved → paused | rejected`.
Approval takes 24-72 hours from Meta. Three places templates surface:

1. **Templates list page** (`/app/whatsapp/templates`) — chip badges on each
   row. Filter by status.
2. **Automation form** — when picking a response template, only `approved`
   templates are selectable. Pending / rejected are visible but disabled with
   tooltip.
3. **Webhook handler** — Meta sends `message_template_status_update` on
   approval / rejection. Update the row + send the tenant an email
   notification.

Template create flow:
- Tenant fills name, category, language, body text (with `{{1}}`, `{{2}}`
  placeholders), optional footer.
- Submit → POST to Meta `/<WABA_ID>/message_templates` → record returned
  `id` + status `pending`.
- Background poll (or wait for webhook) updates status.
- Once `approved`, template is usable in automations.

V1 supports text-only body (no media headers, no buttons). Buttons + media
are spec 027.

### 3.8 Lead identity: phone is a first-class alternate identity

`leads` already has a `phone` field (spec 009 lead capture). Repurpose it as
the WhatsApp identity:

- When a WA message arrives from phone X:
  1. Look for lead with `whatsappPhone = X` AND `tenantId = currentTenant`. If found, use it.
  2. Else, look for lead with `phone = X` (any source) AND same tenant. If found,
     update it: set `whatsappPhone = X`, `whatsappOptInAt = now`,
     `whatsappAccountId = currentAccount`. (This handles the cross-channel merge:
     a person captured via IG who later messages the WA business.)
  3. Else, create a new lead with `whatsappPhone`, `phone`, optional `name`
     from the contact's profile.
- `igUserId` and `whatsappPhone` can both be set on one lead → cross-channel.
- Tags are independent of channel.

This is the foundation for IG → WA bridge (spec 028) but doesn't itself
implement the bridge — it just ensures the data model can express it.

### 3.9 Opt-in / opt-out compliance built into ingestion

DPDP + Meta's policy require provable opt-in for marketing template sends.
We enforce:

- Inbound WA message from a phone we've never seen → record opt-in event with
  source `'whatsapp_inbound'` and timestamp. The customer messaging us IS opt-in
  per Meta's rules (they initiated contact).
- Customer messages "STOP", "UNSUBSCRIBE", "OPT OUT" (case-insensitive,
  configurable list per locale) → set `whatsappOptOutAt`. All future template
  sends to this phone refused.
- Tenant cannot manually clear `whatsappOptOutAt` (only the customer messaging
  again with a non-opt-out keyword can clear it, with implicit re-opt-in
  recorded).
- Opt-in events stored in a new `whatsappOptInLog` collection (immutable
  audit table) with: `tenantId`, `phone`, `source`, `timestamp`, `evidence`
  (the inbound message ID or the form submission ID).

No tenant action required beyond seeing the opt-in/out status on the lead detail page.

### 3.10 No changes to BullMQ queue / worker dispatcher beyond additive job types

The single `events` queue stays. The worker's `dispatchJob` switch (per CLAUDE.md
spec 006 lessons — discriminated union of `JobData`) gets two new cases:

```typescript
case 'send-whatsapp':
  return sendWhatsapp(data, job);
case 'submit-whatsapp-template':
  return submitWhatsappTemplate(data, job);
```

The existing cases (`process-event`, `send-dm`, `generate-ai-reply`,
`send-comment-reply`) are untouched. `JobData` is a Zod discriminated union;
adding new variants is additive.

### 3.11 No changes to existing UI pages

All WhatsApp UI lives under `/app/whatsapp/*`. Existing pages
(`/app/dashboard`, `/app/automations`, `/app/leads`, `/app/sends`, etc.)
get **read-only additions** at most:

- Sidebar gets one new top-level item: **WhatsApp** (between "Automations"
  and "Leads")
- Lead detail page gets a small "WhatsApp" chip if the lead has a
  `whatsappPhone` set — visual marker only, no behavioral change
- Automations form gets a fourth radio option for trigger: **WhatsApp message**
  — disabled with "Connect WhatsApp first" tooltip if no `whatsappAccount`
  exists for the tenant

No re-architecture of any existing page. The Automation form already has
three trigger types (comment, dm, storyReply). Adding a fourth follows the
exact extension pattern of CLAUDE.md §13 (Trigger-Type Addition Checklist) —
that checklist is what this spec follows.

### 3.12 Encryption: same AES-256-GCM with AAD pattern as IG

WhatsApp tokens (system-user access tokens, long-lived per-tenant) are
encrypted at rest with AES-256-GCM. AAD = `phoneNumberId` (analogous to
`igUserId` for IG tokens — see CLAUDE.md spec 003 lessons on row-swap
defense). Same `META_TOKEN_KEY` env var (no new key needed; key is for the
encryption primitive, not the data domain).

---

## 4. Files

### 4.1 New files

```
packages/shared/src/
├── adapters/
│   └── whatsapp.ts                              # Cloud API client (typed, rate-limit aware)
├── handlers/
│   ├── whatsappAccounts/
│   │   ├── connectWhatsapp.ts                   # Embedded Signup callback handler
│   │   ├── disconnectWhatsapp.ts
│   │   ├── listWhatsappAccounts.ts
│   │   └── refreshWhatsappAccountStatus.ts      # Nightly cron — reads Meta tier/quality
│   ├── whatsappTemplates/
│   │   ├── createWhatsappTemplate.ts            # Submits to Meta
│   │   ├── listWhatsappTemplates.ts
│   │   ├── updateWhatsappTemplate.ts
│   │   ├── deleteWhatsappTemplate.ts
│   │   └── handleTemplateStatusWebhook.ts       # Updates row on Meta callback
│   ├── whatsappAutomation/
│   │   └── processWhatsappMessageEvent.ts       # Mirror of processDmEvent for WA
│   └── whatsappCosts/
│       └── getWhatsappCostsSummary.ts           # For dashboard card
├── meta/
│   ├── whatsappWebhookParser.ts                 # Zod schemas for WA webhook payloads
│   └── whatsappOptIn.ts                         # Opt-in/out detection helpers
├── queue/
│   └── (jobTypes.ts extended — additive only)
├── whatsapp/
│   ├── rates.ts                                 # Constant: cost per conversation by category
│   ├── serviceWindow.ts                         # 24h window math + checks
│   └── stopKeywords.ts                          # Multilingual STOP detection (en, hi, hi-en)

apps/web/
├── app/
│   ├── (app)/app/whatsapp/
│   │   ├── page.tsx                             # Hub — status, costs, recent activity
│   │   ├── connect/
│   │   │   └── page.tsx                         # Embedded Signup launcher
│   │   ├── templates/
│   │   │   ├── page.tsx                         # List
│   │   │   ├── new/
│   │   │   │   └── page.tsx                     # Create form
│   │   │   └── [id]/
│   │   │       └── page.tsx                     # Detail / preview
│   │   └── conversations/
│   │       └── page.tsx                         # (Stub) — full inbox is spec 029
│   └── api/v1/
│       ├── auth/whatsapp/
│       │   └── callback/route.ts                # Embedded Signup OAuth callback
│       ├── webhooks/whatsapp/route.ts           # Inbound webhook (POST + GET)
│       ├── whatsapp/
│       │   ├── accounts/route.ts                # GET (list), DELETE (disconnect)
│       │   ├── templates/route.ts               # GET, POST
│       │   └── templates/[id]/route.ts          # GET, PATCH, DELETE
│       └── (existing routes untouched)
└── components/whatsapp/
    ├── connect-cta.tsx                          # "Connect WhatsApp" button + flow
    ├── account-status-card.tsx                  # Status + tier + quality
    ├── template-form.tsx                        # Create/edit
    ├── template-preview.tsx                     # Visual preview of template
    ├── template-status-badge.tsx                # Pending / Approved / etc.
    ├── service-window-indicator.tsx             # "Reply window: 18h left"
    └── cost-summary-card.tsx                    # Month-to-date conversations + ₹

scripts/migrations/
├── 026-whatsapp-accounts.sql                    # CREATE TABLE whatsappAccounts
├── 027-whatsapp-templates.sql                   # CREATE TABLE whatsappTemplates
├── 028-whatsapp-costs.sql                       # CREATE TABLE whatsappCosts
├── 029-whatsapp-opt-in-log.sql                  # CREATE TABLE whatsappOptInLog
├── 030-events-whatsapp-kinds.sql                # ALTER events_kind_check
├── 031-automations-whatsapp-trigger.sql         # ALTER automations_trigger_check
├── 032-sends-whatsapp-channel.sql               # ALTER sends_channel + sends_kind
└── 033-leads-whatsapp-fields.sql                # ALTER leads ADD COLUMN(s)

docs/
├── specs/026-whatsapp-foundation.md             # This file
└── whatsapp-on-bloomdm.md                       # Tenant-facing setup guide

scripts/queries/
├── find-whatsapp-stuck-templates.ts             # Templates pending > 7 days
└── find-whatsapp-cost-overruns.ts               # Tenants near plan cap

tests/
├── unit/whatsapp/
│   ├── webhook-parser.test.ts
│   ├── service-window.test.ts
│   ├── stop-keywords.test.ts
│   └── opt-in.test.ts
├── integration/whatsapp/
│   ├── connect-flow.test.ts
│   ├── inbound-message.test.ts
│   ├── send-freeform.test.ts
│   ├── send-template.test.ts
│   └── cost-tracking.test.ts
└── e2e/whatsapp.spec.ts
```

### 4.2 Files modified (additive only)

```
packages/shared/src/
├── db/schema.ts                                 # Add WA Zod schemas + extend events.kind, automations.trigger, sends.channel/kind, leads
├── types/tenant.ts                              # Re-export new types if needed
├── queue/jobTypes.ts                            # Add 'send-whatsapp', 'submit-whatsapp-template' to JobData union
└── package.json                                 # Add new export subpaths (per CLAUDE.md §12.2)

apps/web/
├── components/app-shell/sidebar.tsx             # Add "WhatsApp" nav item
└── components/automations/automation-form.tsx   # Add "whatsappMessage" trigger radio (disabled if no WA account)

apps/worker/
└── src/index.ts                                 # Add cases to dispatchJob switch

apps/worker/src/jobs/                            # NEW dir entries (no edits to existing files)
├── sendWhatsapp.ts
└── submitWhatsappTemplate.ts

scripts/db-migrate.ts                            # No change; runner handles new migrations automatically
.env.example                                     # Document optional WHATSAPP_DEV_PHONE_ID
CLAUDE.md                                        # Add WhatsApp constraints section + Critical Rule #15
docs/TODO_BUILD.md                               # Add Phase 5 (WhatsApp) entries
```

**Files NOT touched:**
- Any existing handler under `packages/shared/src/handlers/` (other than the
  trigger enum extension)
- `apps/web/app/api/v1/webhooks/meta/route.ts` (existing IG webhook)
- Any of `processCommentEvent`, `processDmEvent`, `processStoryReplyEvent`,
  `sendDM`, `sendCommentReply`, `generateAiReply`
- Existing migrations 001-025
- Existing unit / integration / E2E tests (none modified)

---

## 5. Tests

Per CLAUDE.md §12.5 + Critical Rule #4 (≥3 assertions per test).

### 5.1 Unit (Vitest)

- `webhook-parser.test.ts` — Zod schemas correctly parse Meta's WA webhook
  shapes: `messages` (text, image, button reply, interactive), `statuses`
  (delivered, read, failed), `message_template_status_update`. Reject
  malformed payloads with structured errors.
- `service-window.test.ts` — Pure-function 24h math: in-window at +1h, +23h,
  +23.99h; out at +24h, +25h, +∞. Edge case: no inbound ever (out forever).
- `stop-keywords.test.ts` — "STOP", "Stop", "stop please", "अनसब्सक्राइब",
  "ban kar do" all detected; "i'll stop by tomorrow" NOT detected (false
  positive avoidance — leading-word match only).
- `opt-in.test.ts` — Inbound message creates opt-in log entry; STOP creates
  opt-out; tenant manual edit attempt is blocked.

### 5.2 Integration (Vitest, gated on `hasInfra`)

- `connect-flow.test.ts` — Mock Meta callback → handler creates whatsappAccount
  row, encrypts token with AAD, indexes (tenantId, phoneNumberId).
- `inbound-message.test.ts` — POST signed webhook payload → event row inserted
  with kind='whatsappMessage' and metaEventId=wamid; lead row upserted with
  whatsappPhone; automation match enqueues 'send-whatsapp' job. **Cross-tenant
  isolation:** tenant B's automations don't fire for tenant A's WA event.
- `send-freeform.test.ts` — Job runs in-window → calls Meta → records sends
  row with status='sent'. Out-of-window without template → status='outsideWindow',
  no Meta call.
- `send-template.test.ts` — Approved template + parameters → Meta call with
  correct payload shape. Pending template → refused before Meta call. Marketing
  template increments cost row.
- `cost-tracking.test.ts` — First template in 24h window increments
  conversationsByCategory; second template same window does not double-count.

### 5.3 E2E (Playwright, sandbox-gated)

- `whatsapp.spec.ts` — Tenant logs in, navigates to /app/whatsapp, sees
  "Connect WhatsApp" CTA, clicks (sandboxes the Embedded Signup with a stub),
  lands back with success banner. Submits a template, sees pending status,
  webhook updates to approved (test stub), template now selectable in
  automation form. Creates an automation triggered on `whatsappMessage` with
  keyword PRICE → simulates inbound webhook → asserts a send fires.

E2E gating: `test.skipIf(!process.env.WHATSAPP_E2E)` because the Embedded
Signup flow uses a Meta-hosted modal we can't drive from Playwright. The
integration test covers the post-callback handler logic; the E2E confirms
the page renders and the form submits.

---

## 6. Acceptance criteria

A reviewer can check off each of these in <30 minutes:

- [ ] Tenant connects their WABA and the dashboard shows the connected phone
      number + display name + tier.
- [ ] Inbound WA message from a sandbox sender lands in the events table
      within 5 seconds.
- [ ] Automation with `trigger='whatsappMessage'` and matching keyword fires
      a freeform reply within 10 seconds (in-window).
- [ ] Out-of-window send without template is marked `outsideWindow`, no Meta
      API call made, no money spent.
- [ ] Tenant submits a template, sees `pending` status, simulated approval
      webhook updates it to `approved`, template appears in automation form
      response selector.
- [ ] First marketing template send to a phone increments
      `whatsappCosts.conversationsByCategory.marketing` by exactly 1.
- [ ] Customer sends "STOP" → `leads.whatsappOptOutAt` set; subsequent
      template send refused with `status='failed'`, reason='opted_out'.
- [ ] Cross-tenant isolation: tenant B can't see tenant A's WA accounts /
      templates / events / costs (verified via integration test + manual API
      poke).
- [ ] **Existing IG functionality unchanged**: comment-to-DM, DM-to-DM, story
      replies, lead capture, dashboard pages all behave identically. `pnpm test`
      passes for every pre-026 test without modification.
- [ ] `pnpm smoke` green (typecheck + lint + test:unit + next build).

---

## 7. Risks

### 7.1 Single-app webhook collision
**Risk:** A bug in WA webhook parsing crashes the entire `/api/v1/webhooks/*`
namespace if we colocate handlers.
**Mitigation:** Separate route file (§3.1). Each handler returns 200 even
on parse failure (per Meta's recommendation — they retry on non-2xx and we
don't want retry storms on bad payloads).

### 7.2 Cost runaway
**Risk:** A misconfigured automation fires 10K marketing templates in an
hour at ₹0.83 each = ₹8,300 of vendor cost charged to the TENANT's WABA. If
the tenant is on a ₹999/mo plan, they cannot pay it; even if they can, this
hurts BloomDM's reputation.
**Mitigation:** Per-tenant per-day conversation cap configurable on
`whatsappAccounts.dailyConversationCap`. Default 100 for new accounts (raises
on plan upgrade or operator override). Hard-stop in `sendWhatsapp` job —
return `status='failed'` with reason='daily_cap_exceeded'`. Surface in UI
prominently.

### 7.3 Meta WABA termination kills production for affected tenant
**Risk:** A tenant's WABA gets banned (bad templates, spam, low quality
score). They cannot send anything. No appeal in many cases.
**Mitigation:** Per-tenant WABA isolation (§3.3) ensures it doesn't cascade.
Display tier + quality rating on `/app/whatsapp` so tenants can self-monitor.
Add a future spec for "low quality alert" email when score drops.

### 7.4 Template approval feedback loop
**Risk:** Tenants iterate slowly because Meta takes 24-72hr per template
review. Frustrated tenants churn.
**Mitigation:** UX explanations everywhere ("Meta typically reviews within
24-48 hours" tooltip + email notifications on status change). Pre-built
template library (spec 027) so tenants can start with known-good templates.

### 7.5 Opt-in compliance audit
**Risk:** Meta or DPDP regulator audits a tenant's opt-in records. We need
provable trail or the tenant (and us) is in trouble.
**Mitigation:** `whatsappOptInLog` is immutable, append-only, includes
source channel + timestamp + evidence (inbound message ID or form submission
ID). Surface "Download opt-in log" button on settings. No tenant or admin
edit path.

### 7.6 Embedded Signup UX confusion
**Risk:** Tenants give up during Meta's Embedded Signup flow because it
asks for business verification, phone number, two-factor. We've seen IG
OAuth conversion drop 30% from this kind of flow.
**Mitigation:** Pre-flight checklist on `/app/whatsapp/connect` ("Before you
start, you'll need: a Meta Business account, a phone number not currently
on personal WhatsApp, ~10 minutes"). Video walkthrough. Whatsapp-based human
support for the first 100 tenants.

### 7.7 24h service window edge cases
**Risk:** Customer messages at 23:59 → 00:01 next day. Window math off by
a second, send refused unfairly.
**Mitigation:** All times stored UTC (Postgres timestamptz). Service window
math at +24h exactly; reject at >24h. Test at boundary (+23.999, +24.001).

### 7.8 Phone number reuse across tenants
**Risk:** Tenant A connects phone X. Disconnects. Tenant B connects same
phone X. Existing leads with `whatsappPhone=X` become ambiguous.
**Mitigation:** `leads.whatsappAccountId` (FK to current connecting account)
disambiguates. Disconnect doesn't delete leads — leaves them with the old
account ID, which becomes inactive. Re-connection by the same tenant
reactivates; cross-tenant reuse triggers a warning ("This phone was previously
used by another tenant — leads with this phone are not associated with your
account").

### 7.9 Webhook signature verification using same META_APP_SECRET
**Risk:** If we ever rotate `META_APP_SECRET`, both IG and WA webhooks fail
together.
**Mitigation:** Document this in `docs/whatsapp-on-bloomdm.md` runbook.
Considered but rejected: separate `META_WHATSAPP_APP_SECRET` — would need a
separate Meta App, doubling paperwork. The shared-secret blast radius is
acceptable.

---

## 8. UI / UX design notes

### 8.1 Navigation

Sidebar gets one new top-level item between "Automations" and "Leads":

```
Dashboard
Automations
WhatsApp     ← NEW
Leads
Sends
Settings
```

Rationale: WhatsApp deserves a top-level nav (it's a major capability) but
should not displace Dashboard. Placement after Automations because WA flows
are a kind of automation conceptually.

### 8.2 `/app/whatsapp` hub page (the landing experience)

Three states the page can show:

**State A — Not connected:**
- Hero: "Connect WhatsApp Business"
- Sub: "Receive customer messages, send replies and templates, track ROI."
- CTA: "Connect WhatsApp" → starts Embedded Signup
- Pre-flight checklist below CTA: "What you'll need" (3 bullet points)
- Video walkthrough thumbnail (link to a 90-second YouTube unlisted video)

**State B — Connected, no activity yet:**
- Status card: "Connected: +91 98xxx xxxxx · Tier 1 · Quality: Green"
- Empty-state cards: "Receive your first message", "Submit your first template",
  "Create your first automation" — each clickable, leading to the relevant page
- Embed: "Send yourself a test message" — pastes a wa.me link tenant can
  use to verify the connection

**State C — Connected, active:**
- Status card (same as B)
- Cost summary card: "₹342 used this month · 412/1000 conversations"
- Recent activity feed: last 10 incoming/outgoing messages, links to lead
  detail
- Quick actions: "View templates", "Create automation", "View costs"

### 8.3 Templates page

List view (`/app/whatsapp/templates`):
- Table columns: Name · Category · Language · Status (chip) · Last used · Actions
- Status chips: Draft (gray), Pending (amber pulse), Approved (green),
  Rejected (red, hover for reason), Paused (gray)
- Filter bar: search by name, filter by status
- Empty state: "Submit your first template" CTA

Create form (`/app/whatsapp/templates/new`):
- Two-column layout: form on left, **live preview** on right
- Preview is a faithful WhatsApp bubble render — same fonts, colors, layout
- Variable placeholders (`{{1}}`, `{{2}}`) shown as filled-in samples in
  preview ("Hi {{1}}" → "Hi {Sample Name}")
- Submit button greyed until: name set, body non-empty, category chosen,
  language chosen, all variables defined
- After submit: redirect to detail page with status banner "Submitted for
  Meta approval — typically 24-48h"

Detail page (`/app/whatsapp/templates/[id]`):
- Same preview as create
- Status banner at top: "Pending review" / "Approved on <date>" / "Rejected: <reason>"
- For approved: "Used in 3 automations · last used 2h ago"
- For rejected: re-edit + resubmit button
- For paused (Meta paused due to quality): explain + "Pause has 3 stages…"
  educational copy

### 8.4 Service-window indicator (used everywhere we show a conversation)

Small chip on conversation rows + lead detail:
- **In window**: green chip "Reply window: 18h left" with countdown
- **Out of window, opt-in good**: amber chip "Use template" → tooltip explains
- **Out of window, opted out**: red chip "Customer opted out" — disable send

The chip is a reusable component (`<ServiceWindowIndicator phone, lastInboundAt, optOutAt />`).

### 8.5 Cost summary card on dashboard

Shown on `/app/dashboard` if tenant has WA connected:
```
WhatsApp this month
₹342 / ₹1,000 plan limit                  [progress bar]
412 conversations: 350 service · 50 utility · 12 marketing
                                           [View details →]
```

Not surfaced if tenant has no WA — preserves existing dashboard for IG-only
tenants.

### 8.6 Automation form extension

Trigger radio gets a fourth option:
```
○ Comment on Reel/Post
○ User DMs you
○ Story reply  (Beta — pending Meta approval)
○ WhatsApp message  ← NEW
```

When **WhatsApp message** is selected:
- Show WA-specific keyword field (same as DM trigger)
- Show "Reply" section with two options:
  - **Freeform text** (only fires inside 24h window — explained in helper text)
  - **Template** (dropdown of approved templates only — pending/rejected
    shown grey-disabled)
- Hide IG-specific options (post selector, comment-reply field)

If tenant has no `whatsappAccount` connected: the radio is disabled with
tooltip "Connect WhatsApp first" + button to /app/whatsapp/connect.

### 8.7 Lead detail page extension

If lead has `whatsappPhone`: small "WhatsApp" chip next to name + a section
listing recent WA messages. **No live conversation thread in this spec** —
that's spec 029. The list is read-only timeline.

### 8.8 Onboarding

On first connect, a 3-step modal:
1. "Submit your first template" — pre-fills a generic "OrderConfirmation"
   template the tenant can edit + submit in 30 seconds.
2. "Create your first automation" — opens automation form pre-set to WA
   trigger + the just-submitted template.
3. "Send yourself a test" — wa.me link to send a test message to your own
   number to see the automation fire.

This onboarding uses the existing `OnboardingChecklist` component pattern
from spec 4.7 (`apps/web/components/dashboard/onboarding-checklist.tsx`) —
add a fourth step for tenants who connect WA, lives only on `/app/whatsapp`.

### 8.9 Mobile

Every WA page must work on mobile:
- Tenants will check WhatsApp activity on their phones
- Templates list is the most-viewed page; ensure responsive (probably card
  layout < 640px, table ≥ 640px)
- The wa.me test-link CTA should be a clickable link on mobile (opens WA
  immediately)

---

## 9. Open questions for review

These are the decisions where the spec author wants the reviewer's call
before code starts:

1. **Embedded Signup vs. manual token paste in v1?** Embedded Signup is
   correct UX but requires Meta's "Tech Provider" status (we apply for it,
   takes 1-2 weeks). Manual paste is faster to build but ugly. Recommendation:
   manual paste FIRST (week 1 of build), Embedded Signup as a follow-up
   (week 4-5 of build) once we have Tech Provider status. Same `connectWhatsapp`
   handler serves both; just two different entry UIs.

2. **Daily conversation cap default for new accounts.** §7.2 mentions 100/day
   default. Reviewer to confirm. Could also be plan-tier-driven.

3. **Stop-keyword list per locale.** §3.9 mentions Hindi + Hindi-English.
   List should be reviewed by a native Hindi-speaking creator for false
   positives. Reviewer to provide list or approve a starting set.

4. **Cost surfacing currency.** Dashboard card shows ₹. Tenants outside India
   would expect $. Currently the platform is INR-only; defer multi-currency
   to whenever we sell internationally. Confirmed?

5. **Whether to surface tier/quality rating to tenants.** §3.5 says we don't
   in v1. Counter-argument: tenants want to know. Recommendation: show as
   an info row in the status card, no actionable UI yet ("Tier 1 · Quality:
   Green — what does this mean?" with a docs link).

6. **Webhook URL for tenants connecting their own WABA.** Each tenant's WABA
   webhook should point to OUR `/api/v1/webhooks/whatsapp`. The Embedded
   Signup flow lets us configure this on the tenant's behalf — verified?

---

## 10. Effort estimate

Realistic engineering effort assuming an experienced full-stack TS dev,
focused full days, no scope creep:

| Slab | Effort | Cumulative |
|---|---|---|
| §3.2 schema migrations + Zod | 2 days | 2 |
| §4 adapter (`whatsapp.ts`) + webhook parser + signature verify | 3 days | 5 |
| Connect / disconnect flow (manual paste version) | 2 days | 7 |
| `processWhatsappMessageEvent` + automation form extension | 3 days | 10 |
| `sendWhatsapp` job + service-window enforcement + rate limit | 3 days | 13 |
| Templates: schema + CRUD + create form + Meta submit | 4 days | 17 |
| Templates webhook + status updates + UI badges | 2 days | 19 |
| Cost tracking + dashboard card | 2 days | 21 |
| Opt-in / opt-out + STOP detection + log | 2 days | 23 |
| `/app/whatsapp` hub page (3 states) + onboarding | 3 days | 26 |
| E2E + integration tests | 4 days | 30 |
| Embedded Signup migration (after Tech Provider approval) | 2 days | 32 |
| Buffer for surprises | 4 days | 36 |

**Total: ~36 dev days = ~7-8 calendar weeks** of focused engineering. This
matches the §M8 estimate from the original WhatsApp roadmap critique
(8-10 weeks). Faster is unrealistic; slower means scope creep.

---

## 11. After this spec ships

Open paths for follow-up specs:

- **Spec 027** — Templates v2: media headers, buttons (quick-reply +
  call-to-action + URL), list pickers, locale variants
- **Spec 028** — IG → WhatsApp bridge: opt-in template flow, cross-channel
  lead unification, attribution chain
- **Spec 029** — Unified inbox: real-time IG + WA conversation thread per lead
- **Spec 030** — WhatsApp drip flows: multi-step state machines with delays
- **Spec 031** — Voice note replies (ElevenLabs voice clone, premium tier)
- **Spec 032** — WhatsApp catalog + UPI deep-link checkout

Each is its own spec; this one establishes the foundation they build on.
