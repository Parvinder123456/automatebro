# Spec 016 — AI Intent Classifier (Smart Triggers)

> **MDD phase:** Document → Code (autonomy mode for Phase 1; smoke gate enforced).
> **Implements:** Phase 1.2 of `docs/TODO_BUILD.md` — "AI sentiment / intent
> classifier on inbound" — opens the "AI smart triggers" feature line.

**Status:** In flight
**Branch:** `feat/phase1-2-ai-classifier`

---

## 1. Goal

Classify every inbound comment / DM into one of four intents — `buying`,
`support`, `spam`, `other` — using gpt-4o-mini, persist the result on the
`events` row, and let tenants **gate automations on intent**.

After this spec ships:

- Every `comment` or `message` event lands in the worker, gets a one-shot
  intent classification call (~50 input tokens, ~20 output), and the result
  is written back to `events.intent` + `events.intentConfidence`.
- Tenants can attach an `intents` filter to a trigger (e.g. "only fire on
  `buying` intent"). When set, the trigger only fires if the classified
  intent matches.
- Backwards-compatible: existing triggers with `intents=null` fire on any
  intent (no behavioural change for shipped automations).
- Cost-aware: if `aiUsage.costInr >= cap`, classification is skipped and the
  intent gate is bypassed (the trigger fires as if `intents=null`). Logged.
- Retry-safe: on BullMQ retry, an event with `intent !== null` is not
  re-classified.

This is the foundation for "AI smart triggers" — a differentiator vs
LinkPlease's keyword-only filter.

---

## 2. Out of scope

- **Per-tenant intent vocabulary.** Four fixed intents in v1; a custom-intent
  feature lands post-launch if tenants ask.
- **Multi-intent / hierarchical classification.** Single label, single
  confidence.
- **Intent-driven UI insights** (e.g. "this week 12 buying-intent comments
  were missed because no automation fires on 'buying'"). Lands with the AI
  usage dashboard (Phase 2.2).
- **Sentiment scoring (positive/negative/neutral).** Intent is more
  actionable for our use case.
- **Per-event re-classification when intent definitions change.** v1 treats
  the four-label vocabulary as fixed.
- **Multilingual prompts.** gpt-4o-mini handles English + Hindi natively;
  we don't tune the prompt per language.
- **Spam-intent → auto-block** the sender. We just label; the tenant
  decides whether to fire automations on spam (typical: don't).

---

## 3. Architectural decisions

### 3.1 Classify on the worker, not the webhook

The webhook persists the event in <5s and immediately enqueues
`process-event`. Classification is non-trivial (OpenAI round-trip ~500ms p50
+ jitter), so it lives in the worker, before the keyword + intent match.
Failure to classify does not block ingestion.

### 3.2 Persist on `events`, not `sends` or per-automation

One event → one classification. Storing on `events` means:
- Idempotent on retry (read `events.intent`; if non-null, skip OpenAI).
- Multiple matching automations share one classification.
- Future analytics ("how many buying-intent comments?") have a clean
  `events.intent` column to aggregate.

### 3.3 Default trigger.intents = null = "any intent"

Backwards-compatible. Existing triggers (created before this spec) have
`intents = null`. Their behaviour is unchanged.

When `trigger.intents` is a non-empty array, the trigger only fires if
`event.intent` is in the array.

### 3.4 Cost-cap behaviour: skip classification, fire as if no gate

If `aiUsage.costInr >= aiUsage.cap` for the current month, we skip the
OpenAI call. The trigger then evaluates as if `intents = null` (fires
regardless of intent). Trade-off:

- **Pro:** Tenants who cap-out still get keyword-matching; their automations
  don't go silent.
- **Con:** Spam-intent comments may slip through if a tenant relied on
  intent-gating to silence them.

We log a warning when this happens (`'classifyIntent: cap exceeded, gate
bypassed'`) so the operator dashboard can surface it.

### 3.5 Single OpenAI call, structured output

Prompt (one-shot): system message defining the four labels, then the
content. Use OpenAI's `response_format: { type: 'json_object' }` to force
structured output.

Output schema: `{ intent: 'buying' | 'support' | 'spam' | 'other',
confidence: 0-1 }`.

Validation: parse with Zod. On parse failure, log warn, treat as
"unclassified" (intent stays null, gate bypassed).

### 3.6 No moderation pass

We already moderate AI-generated REPLIES (spec 008). Classifier inputs are
end-user content we'd otherwise process anyway — moderation is meaningless
for input-side classification. Skipping the moderation call halves the
OpenAI round-trip cost.

### 3.7 Schema changes

| Table | Column | Type | Notes |
|---|---|---|---|
| `events` | `intent` | TEXT NULL | One of `buying`, `support`, `spam`, `other`, or NULL (unclassified). |
| `events` | `intentConfidence` | DOUBLE PRECISION NULL | 0–1 from the classifier. |
| `triggers` | `intents` | TEXT[] NULL | When non-null and non-empty, the trigger only fires if `event.intent` is in this array. NULL = any intent. |

Migration `010-events-intent-trigger-intents.sql` adds these idempotently.
Postgres array on `triggers.intents` is fine without a CHECK — Zod
validates the values at the application layer.

---

## 4. Files to create / modify

### 4.1 Migration
- `scripts/migrations/010-events-intent-trigger-intents.sql`

### 4.2 Schema + types
- Modify `packages/shared/src/db/schema.ts`:
  - `EventSchema` — add `intent: z.enum(...).nullable().optional()` + `intentConfidence: z.number().min(0).max(1).nullable().optional()`
  - `TriggerSchema` — add `intents: z.array(z.enum(...)).nullable().optional()`
  - Export new `IntentSchema = z.enum(['buying','support','spam','other'])` for reuse

### 4.3 Adapter + handler
- Modify `packages/shared/src/adapters/openai.ts` — add `classifyIntent(text: string)` helper that returns `{ intent, confidence } | null` and updates `aiUsage`.
- Create `packages/shared/src/handlers/classifyIntent.ts` — the worker-facing handler that:
  - Reads `events.intent` first; if non-null, return early.
  - Calls the adapter.
  - On success, `db.updateOne('events', { _id }, { $set: { intent, intentConfidence } })`.
  - On failure / cap-exceeded, leaves intent null and returns null.
- Modify `packages/shared/src/handlers/processCommentEvent.ts`:
  - Call `classifyIntent(event)` before the automation loop.
  - For each automation, after keyword match, also check intent match (if `trigger.intents` is non-empty, intent must be in it).
- Modify `packages/shared/src/handlers/processDmEvent.ts` — same change pattern.
- `packages/shared/package.json` exports — add `./handlers/classifyIntent`.

### 4.4 API + handler input
- Modify `packages/shared/src/handlers/automations/createAutomation.ts` — accept optional `intents: string[] | null` in `CreateAutomationInput`, pass through to `triggers` insert.
- Modify `packages/shared/src/handlers/automations/updateAutomation.ts` — accept optional `intents` in patch body.
- API routes (`POST /api/v1/automations`, `PATCH /api/v1/automations/[id]`) Just Work — they pass through validated body.

### 4.5 UI
- Modify `apps/web/components/automations/automation-form.tsx`:
  - Add an "Intent filter (optional)" multi-select that toggles each of the
    four intents. Empty selection = "any intent" (sends `intents: null`).
  - Show a hint: "Only fire when AI detects one of these intents."

---

## 5. Tests

### 5.1 Unit (`packages/shared/src/db/schema.test.ts`)
- Append: `IntentSchema` parses `buying`/`support`/`spam`/`other`, rejects others.
- `TriggerSchema` accepts `intents: null`, `intents: []`, `intents: ['buying']`.
- `EventSchema` accepts `intent: null` and each valid value.

### 5.2 Integration (`tests/integration/classifyIntent.test.ts`)
Gated on `hasInfra` + `OPENAI_API_KEY`. Skipped if no key.
- **CI1: classifies a buying-intent message** — input "I want to buy this!", assert returned `intent === 'buying'`.
- **CI2: persists intent on the event row** — call once, then re-fetch event, assert `event.intent` set.
- **CI3: idempotent on retry** — call twice on same event id; second call doesn't hit OpenAI (assert by mocking the adapter? simpler: assert the existing intent is returned without re-write).
- **CI4: cap-exceeded → returns null + leaves event unclassified** — seed `aiUsage` at the cap; call; assert null + event.intent still null.

### 5.3 Integration (`tests/integration/processDmEvent.test.ts` extension)
- **DM8: trigger.intents = ['buying'] only fires on buying intent** — seed automation with intents filter, fire one buying event + one support event, assert one send (the buying one).
- **DM9: trigger.intents = null fires regardless of intent** — back-compat sanity.

### 5.4 E2E (`tests/e2e/automations.spec.ts` extension)
- **A5: create automation with intent filter** — POST with `intents: ['buying']`, assert 201 + LIST returns the filter.

---

## 6. Acceptance criteria

- [ ] Migration 010 SQL written + idempotent.
- [ ] `EventSchema` + `TriggerSchema` updated; types flow via `z.infer`.
- [ ] `IntentSchema` exported from `db/schema.ts`.
- [ ] `classifyIntent` adapter + handler shipped; cost-cap behaviour matches §3.4.
- [ ] `processCommentEvent` + `processDmEvent` integrate the classifier and intent gate.
- [ ] `CreateAutomationInput` + `UpdateAutomationInput` accept `intents`.
- [ ] Automation form UI gains an intent-filter multi-select.
- [ ] All §5 tests pass.
- [ ] `pnpm smoke` green (typecheck + lint + test:unit + next build).
- [ ] CLAUDE.md "Lessons learned" updated.

---

## 7. Risks + mitigations

1. **OpenAI latency adds ~500ms p50 to event processing.** Acceptable — DM
   sends are rate-limited at 185/hr/account anyway, and the classifier
   doesn't block ingestion (webhook → events insert is sync; classify is
   async on worker).
2. **Mis-classification fires the wrong automation.** Confidence < 0.5 →
   treat as `'other'` to avoid acting on low-confidence labels. Tenants
   relying on the gate get fewer false positives.
3. **gpt-4o-mini drift across model versions.** We pin the model name in
   `adapters/openai.ts`; major-version bumps land via a follow-up spec.
4. **Cap-exceeded fall-through.** Documented in §3.4; logged as warning so
   the operator can surface it in the dashboard.

---

## 8. Lessons we expect to learn (to backfill in CLAUDE.md after merge)

- OpenAI structured-output (`response_format: json_object`) reliability and
  parsing patterns.
- Adding optional schema columns idempotently without breaking existing
  rows or app code.
- Confidence-threshold heuristics for low-stakes classifiers in a
  consumer-facing product.
