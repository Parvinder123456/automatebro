# Spec 008 — AI Replies

> **MDD phase:** Document → implementation. Compressed loop.
> **Implements:** §Appendix B item 8 of `docs/engineering-plan.md`.

**Status:** Implementation in progress
**Branch:** `feat/spec-008-ai-replies`

---

## 1. Goal

Allow automations to reply with AI-generated content instead of a
static template. Per engineering plan §4 the model is OpenAI
`gpt-4o-mini` (cheap, fast, low-latency, ~$0.15/1M input tokens).

After this spec ships:

- Automations created with `response.mode: 'ai'` and an `aiPrompt` +
  optional `aiTone` produce AI-generated DM replies.
- The worker's `processCommentEvent` enqueues a `generate-ai-reply`
  job when `response.mode === 'ai'` (instead of going straight to
  `send-dm`).
- The `generate-ai-reply` handler:
  1. Checks the tenant's monthly AI cost cap (per `aiUsage` row).
  2. Builds a prompt from `aiPrompt` + tone + the inbound comment.
  3. Calls `gpt-4o-mini` (10s timeout).
  4. Runs the output through OpenAI Moderation. If flagged,
     fall back to `responses.fallbackTemplate`; if no fallback,
     mark `sends.status='failed'`.
  5. Updates `aiUsage` (`$inc` tokens + cost in paise).
  6. Enqueues `send-dm` with the rendered content.

---

## 2. Out of scope

- Streaming responses (we're sending a single DM, not a chat).
- Multiple model providers (Anthropic, Groq, etc.) — defer; v1 is
  OpenAI-only behind a single adapter so swap is one file.
- Per-prompt fine-tuning UI → spec 011.
- Spend dashboards → spec 011 / 014.

---

## 3. Architectural decisions

### 3.1 Cost cap per tenant per month — hard stop

Each `aiUsage` row represents one tenant's spend in one calendar
month (`tenantId + month`, where `month = 'YYYY-MM'`). On AI generate:

1. Read the row (or implicit zero if not yet created).
2. If `costInr >= cap`, return `errorCode: 'aiCapExceeded'`,
   mark the `sends` row failed, and stop.
3. After successful API call, `$inc` `inputTokens`, `outputTokens`,
   `costInr` (paise). Upsert with `$setOnInsert: cap`.

**Default caps:** `free` plan → ₹100/mo (₹100 = 10000 paise),
`starter` → ₹500, `growth` → ₹2000, `agency` → ₹5000.
Tenants with credit cards on file can raise their cap (post-launch UI).

### 3.2 OpenAI moderation gate

Every AI-generated reply runs through `omni-moderation-latest` (free).
If `flagged === true`, we DO NOT send. We try the fallback template;
if no fallback, mark `sends.status='failed'` with `errorCode:
'moderationFlagged'`.

### 3.3 Fallback template on AI failure

If the OpenAI call times out or returns 5xx, we don't retry the AI —
that wastes budget. Instead we use `responses.fallbackTemplate` and
proceed to `send-dm`. This way an OpenAI outage degrades gracefully
to "static template" behaviour.

### 3.4 Pricing math hard-coded for v1

`gpt-4o-mini` pricing as of 2026: $0.15/1M input, $0.60/1M output.
Convert to paise via `INR_PER_USD = 84` (cached constant; close
enough for cost tracking — exact rate matters when settling, not
estimating).

```
costInr = (inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000 * 84 * 100
```

When OpenAI updates pricing, we update the constant.

---

## 4. File layout

```
scripts/migrations/
└── 006-aiusage.sql                                  # NEW

packages/shared/src/
├── db/schema.ts                                     # MODIFIED — add AiUsageSchema
├── types/tenant.ts                                  # MODIFIED — add AiUsage type
├── env.ts                                           # MODIFIED — OPENAI_API_KEY required
├── adapters/
│   ├── openai.ts                                    # NEW — typed OpenAI client
│   └── openai.test.ts                               # NEW — adapter unit tests (mocked)
└── handlers/
    ├── generateAiReply.ts                           # NEW — full handler
    └── processCommentEvent.ts                       # MODIFIED — branch on mode='ai'

apps/worker/src/jobs/
└── generateAiReply.ts                               # MODIFIED — wire real handler
```

---

## 5. Data model — migration 006

```sql
CREATE TABLE IF NOT EXISTS public."aiUsage" (
  "_id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "month"         TEXT NOT NULL,
  "inputTokens"   BIGINT NOT NULL DEFAULT 0,
  "outputTokens"  BIGINT NOT NULL DEFAULT 0,
  "costInr"       BIGINT NOT NULL DEFAULT 0,
  "cap"           BIGINT NOT NULL,
  UNIQUE ("tenantId", "month")
);
```

`cap` and counters are bigint paise (₹0.01 increments), ample for
millions of replies.

---

## 6. Acceptance criteria

### 6.1 Unit
- OpenAI adapter throws cleanly on bad API key (mocked HTTP)
- Cost calculation: 1000 input + 200 output tokens at gpt-4o-mini
  rates → expected paise
- Moderation flagged → handler returns flagged result without sending

### 6.2 Integration
- generate-ai-reply with valid OpenAI key produces a non-empty reply
  and increments aiUsage (real OpenAI call, gated on key present)
- Cap exceeded → handler short-circuits, marks send 'failed'
- Fallback template substitutes when AI errors

### 6.3 Build/lint/types
All clean.

---

## 7. Risks

1. **OpenAI key not yet provided.** The handler is gated on
   `OPENAI_API_KEY` being present. In `.env`, add a placeholder
   `OPENAI_API_KEY=` (empty). The env schema treats it as optional
   for now; once you add a real key, change to `.min(1)` required
   (one-line edit).
2. **Cost overrun risk.** A misconfigured prompt that loops or
   spawns long replies can blow through the cap fast. The cap is a
   hard stop per month — once hit, all AI replies for that tenant
   stop until the next month or you raise the cap manually.
3. **Pricing drift.** Hard-coded constants will go stale. Document
   in code; revisit at each spec.

---

**END OF SPEC — proceeding to implementation.**
