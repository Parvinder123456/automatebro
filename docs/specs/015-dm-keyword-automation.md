# Spec 015 — DM-keyword Automation

> **MDD phase:** Document → Test → Code (compressed loop, single approval gate).
> **Implements:** Phase 1.1 of `docs/TODO_BUILD.md` — "User DMs to you" trigger
> parity with LinkPlease's comment-to-DM-style automation, applied to inbound DMs.

**Status:** Awaiting approval — no code yet
**Branch:** `feat/phase1-dm-keyword`

> Spec numbers 010, 014 are reserved for billing and observability respectively
> (engineering plan §Appendix B). 012 + 013 are in flight on a parallel branch.
> Phase 1 work starts at 015 to keep numbering linear.

---

## 1. Goal

Tenants can create an automation whose trigger is "user sends you a DM with this
keyword". After this spec ships:

- Tenant configures an automation with `trigger: 'dm'`, keyword `'LINK'`,
  matchMode `'contains'`, response template "Here's the link: {url}".
- An Instagram end-user DMs the connected business account: "Hey, send me the LINK".
- Within seconds, a DM reply lands in the user's inbox with the rendered template.
- The send is recorded in `sends` with `kind='dm'`, `automationId` filled in,
  same status flow as comment-to-DM (`queued → sent | failed | rateLimited |
  outsideWindow`).
- Lead capture (spec 009) **continues to fire in parallel** on the same inbound
  message — capturing email/phone if the user volunteered any.

This is the "User DMs to you" tile in LinkPlease's trigger UI.

---

## 2. Out of scope

- **Conversation state / multi-turn flows.** The DM-trigger fires per inbound
  message. State machines ("ask for email, then ask for phone") land in spec 016+
  (AI follow-ups).
- **DM-trigger AI replies.** The shared `responses.mode='ai'` path Just Works for
  the new trigger because `processDmEvent` reuses the same `responses` table
  shape; we test it but the AI prompt isn't re-tuned for DM-context. That's
  Phase 1.2 work.
- **Per-conversation rate limiting.** The existing 185/hr per-igAccount limiter
  applies; we don't add per-end-user limits in this spec.
- **DM "starts with" auto-greeting.** A user's first-ever DM to the business is
  not specially detected; we only match keywords. First-DM welcome is a
  separate "first contact" trigger, deferred.
- **Multi-keyword AND-matching.** Same as comment-to-DM — keywords are OR'd.
- **Story-reply trigger.** That's spec 017 (Phase 1.4) and gated on Meta App
  Review for `instagram_manage_messages`.
- **Comment-reply on a DM.** DMs aren't public comments; the `responses.commentReply`
  field is ignored when `automation.trigger === 'dm'`.

---

## 3. Architectural decisions

### 3.1 New trigger enum value `'dm'`, not a new collection

`AutomationSchema.trigger` already enumerates `comment | storyReply | mention`.
We extend the enum with `'dm'`. Nothing about `triggers` / `responses` /
`sends` shape changes.

### 3.2 Parallel dispatch from `processEvent`

The current dispatcher branches on `event.kind === 'message'` and calls
`captureLead`. After this spec, both `captureLead` AND `processDmEvent` run
**in parallel** via `Promise.all` (CLAUDE.md Critical Rule #8 — independent
awaits parallelise).

The two are genuinely independent:
- `captureLead` writes to `leads` table.
- `processDmEvent` reads `automations + triggers + responses`, writes to `sends`,
  enqueues `send-dm` (or `generate-ai-reply`).

If either throws, the job retries via BullMQ. We don't want one failure to
block the other; fan them out. Wrapping both in `Promise.allSettled` would
mask retryable errors, so we use `Promise.all` and let BullMQ retry.

### 3.3 24-hour messaging window — DM-trigger always within window

When a user DMs us, that **is** the interaction that opens the 24-hour
window. Inbound message events get persisted to `events` BEFORE the worker
fires `processEvent`, so the existing `messageWindow.ts` check (which queries
`events` for the last interaction) always returns "in window" for DM-trigger
sends.

We don't add a special-case bypass; the existing `sendDM` handler's window
check naturally passes. This keeps one code path for all triggers.

### 3.4 New `processDmEvent` handler — mirror of `processCommentEvent`

Lives at `packages/shared/src/handlers/processDmEvent.ts`. ~70 LOC. Differences
from `processCommentEvent`:

| | `processCommentEvent` | `processDmEvent` |
|---|---|---|
| Payload location | `change.value.text`, `change.value.from.id`, `change.value.media.id` | `messaging.message.text`, `messaging.sender.id` |
| postId scoping | applies | N/A (DMs aren't post-scoped) |
| Trigger filter | `trigger: 'comment'` | `trigger: 'dm'` |
| Comment-reply path | optional | skipped (ignored even if set) |
| Username lookup | `change.value.from.username` | `messaging.sender.username` (often null in v1 webhooks) |

We do NOT factor out a shared "match keyword + enqueue send" helper yet — the
two handlers are similar but readable side-by-side; abstraction can land in a
post-Phase-1 cleanup once we have 4+ trigger handlers and the shape is locked.

### 3.5 No webhook subscription change

`messages` is already in the webhook fields list (subscribed during IG
account connect, per spec 005). No `connectIgAccount` change needed.

### 3.6 Migration `009-automations-trigger-dm.sql`

The current automations table has a `CHECK` constraint on `trigger` allowing
only `comment | storyReply | mention`. We need to drop the old constraint and
add a new one that includes `dm`. Postgres doesn't support ALTER on a CHECK
constraint in one statement; standard pattern is DROP + ADD inside one
transaction.

### 3.7 UI change in automation-form

The trigger dropdown in `apps/web/components/automations/automation-form.tsx`
gets a `'dm'` option labelled "When user DMs you with a keyword". When `'dm'` is
selected, we hide the (currently absent) post-id picker and any
comment-reply-only fields. Default selection stays `'comment'` for new automations.

---

## 4. Files to create / modify

### 4.1 Schema + migration
- Modify `packages/shared/src/db/schema.ts` — extend `AutomationSchema.trigger` enum to include `'dm'`.
- Create `scripts/migrations/009-automations-trigger-dm.sql` — drop + recreate the trigger CHECK constraint.

### 4.2 Handler
- Create `packages/shared/src/handlers/processDmEvent.ts` (~70 LOC). Mirror of `processCommentEvent.ts` for `kind='message'` events.
- Modify `apps/worker/src/jobs/processEvent.ts` — for `kind='message'` branch, run `captureLead` + `processDmEvent` in parallel via `Promise.all`.
- Modify `packages/shared/package.json` exports map — add `./handlers/processDmEvent`.

### 4.3 UI
- Modify `apps/web/components/automations/automation-form.tsx`:
  - Add `'dm'` to the trigger select options
  - When `trigger === 'dm'`, the form copy changes ("When user DMs your account with…" instead of "When user comments…")
  - The select stays single-value so existing automations with `trigger='comment'` aren't affected.

### 4.4 No new API routes
- `POST /api/v1/automations` already accepts `trigger` from the body. The Zod schema accepts the new enum value automatically.
- `GET /api/v1/automations` already returns `automation.trigger` in its response.
- No route changes.

---

## 5. Tests

### 5.1 Integration: `tests/integration/processDmEvent.test.ts`
Gated on `hasInfra`. Each test seeds tenant + igAccount + automation + trigger + response via the existing fixture, then constructs a fake `EventRecord` and calls `processDmEvent` directly.

- **DM1: keyword match enqueues send** — message text "send me LINK", trigger keyword `LINK`. Assert one `sends` row in `queued` status with `kind='dm'`. Assert one job enqueued on `events` queue with `type='send-dm'`.
- **DM2: no match → no send** — message text "hello", trigger keyword `LINK`. Assert zero `sends` rows.
- **DM3: tenant A automation does not fire on tenant B's event** — cross-tenant isolation.
- **DM4: AI mode enqueues `generate-ai-reply` instead of `send-dm`** — `responses.mode='ai'`. Assert the queued send has `aiGenerated=true` and the job is `generate-ai-reply`.
- **DM5: status='paused' automation does NOT fire** — paused automation, keyword matches. Assert zero sends.
- **DM6: trigger='comment' automation does NOT fire on message event** — confirms the `trigger: 'dm'` filter is applied.

### 5.2 Integration: `tests/integration/processEventDispatch.test.ts` (extend existing or new)
- **DM7: kind='message' fires captureLead AND processDmEvent in parallel** — set up an inbound DM with both an email AND a matching keyword. Assert `leads` row created (email captured) AND `sends` row created (DM enqueued). Both must succeed; job retries on either failure.

### 5.3 Unit: `packages/shared/src/db/schema.test.ts` (extend)
- **U-trigger-dm: AutomationSchema accepts `trigger: 'dm'`** — `AutomationSchema.parse({...trigger:'dm'})` succeeds.
- **U-trigger-invalid: AutomationSchema rejects unknown trigger** — fails on `trigger: 'banana'`.

### 5.4 E2E: extend `tests/e2e/automations.spec.ts` (or new `tests/e2e/dm-automation.spec.ts`)
- **DME1: create DM-trigger automation via form** — log in, navigate to /app/automations/new, select "When user DMs you", fill keyword + template, submit. Assert URL goes to `/app/automations`, assert the new automation appears in the list with `Trigger: dm`. ≥3 assertions per CLAUDE.md.
- **DME2: existing comment automations still render correctly** — sanity check the trigger dropdown didn't break the existing flow.

### 5.5 Form-change audit (CLAUDE.md §14)
- The automation form gains a select option but **doesn't add a required field or new gate**. No existing E2E that POSTs to `/api/v1/automations` needs body updates (trigger was already required).
- Existing tests in `tests/e2e/automations.spec.ts` create automations with `trigger: 'comment'` — those keep passing.

---

## 6. Acceptance criteria

- [ ] Migration 009 SQL written + idempotent (`IF NOT EXISTS` semantics where applicable; for CHECK-constraint replacement, use `DROP IF EXISTS` + `ADD`).
- [ ] `AutomationSchema.trigger` Zod enum includes `'dm'`.
- [ ] `packages/shared/package.json` exports `./handlers/processDmEvent`.
- [ ] `processDmEvent` handler exports `processDmEvent(event)` returning `{ matched, enqueued }`.
- [ ] `processEvent` dispatcher fans out `captureLead` + `processDmEvent` in parallel for `kind='message'`.
- [ ] Automation form UI shows the new "When user DMs you" option and renders correctly when selected.
- [ ] All tests in §5 pass (unit + integration; E2E gated on infra in CI).
- [ ] `pnpm smoke` passes (typecheck + lint + test:unit + next build).
- [ ] CLAUDE.md "Lessons learned" section appended with anything new.
- [ ] Trigger-Type Addition Checklist (CLAUDE.md §13) — every box checked.

---

## 7. Risks + mitigations

1. **Existing `kind='message'` events were processed by `captureLead` only.** Changing the dispatcher to also run `processDmEvent` means previously-processed events with `processedAt !== null` won't re-run (the dispatcher's idempotent guard). Side effect: existing tenants who had a DM-trigger they wanted **before this spec** wouldn't see retroactive fires. Acceptable — this is a forward-only feature.

2. **Parallel dispatch makes failure attribution noisier.** If `processDmEvent` throws, the BullMQ retry will also re-run `captureLead` (lead upsert is idempotent — same `(tenantId, igAccountId, igUserId)` upsert is a no-op). No data corruption risk.

3. **Migration 009's CHECK-constraint swap is a brief window where new inserts could violate the new constraint** if they snuck in between DROP and ADD. Mitigation: wrap in a `BEGIN; … COMMIT;` transaction; Postgres holds an exclusive lock on the constraint for the duration. Runtime impact is sub-millisecond.

4. **24-hour-window check naturally passes for DM-triggers but not for AI-fallback paths if the AI reply takes long.** The window resets each time the user messages; AI replies typically fire within 5s. Acceptable.

5. **UI ambiguity: dropdown now has 2 enabled options + others greyed-out.** We label the comment + dm options clearly. Story-reply / mention stay disabled with a "Coming soon — pending Meta approval" badge.

---

## 8. Lessons we expect to learn (to backfill in CLAUDE.md after merge)

- Zod enum extension + Postgres CHECK constraint replacement: the right migration shape (`DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT … CHECK …` in a transaction).
- Parallel `processEvent` dispatch via `Promise.all` — pattern for any future event kind that needs multiple handlers.
- Confirming the trigger-type checklist (CLAUDE.md §13) is sufficient on first real use.
