# Spec 007 — Comment-to-DM

> **MDD phase:** Document → implementation. Compressed loop.
> **Implements:** §Appendix B item 7 of `docs/engineering-plan.md`.

**Status:** Implementation in progress
**Branch:** `feat/spec-007-comment-to-dm`

---

## 1. Goal

The headline feature. After this spec ships:

- A tenant can POST `/api/v1/automations` to create a comment-keyword
  rule with a templated DM response. Lists/edits/deletes via the same
  endpoint.
- When a webhook event arrives with `kind=comment`, the worker matches
  the comment text against each active automation's keywords. On match,
  it enqueues a `send-dm` job.
- The `send-dm` handler:
  - Looks up the destination IG account, decrypts the Page Access Token.
  - Checks the 24-hour messaging window (Meta requires the recipient
    interacted with the page in the last 24h, OR uses an approved
    message tag — we use neither tag in v1).
  - Checks the per-igAccount rate limit (185/hr sliding window in Redis).
  - Calls Meta `/me/messages` with the recipient PSID.
  - Logs the attempt to `sends` regardless of outcome.

This is BACKEND ONLY. The UI (automation builder) lands in spec 011.
Until then, you create automations via raw API calls (or curl).

---

## 2. Out of scope

- UI for creating/editing automations → spec 011
- AI replies (mode='ai' on `responses`) → spec 008
- Lead capture (parse email from DM) → spec 009
- Story-reply trigger (vs comment) → covered by same `kind` dispatch
  but story-reply matching is post-launch refinement
- Admin dashboard for failed sends → post-launch

---

## 3. Architectural decisions

### 3.1 One automation = one trigger row + one response row

Engineering plan §5 separates `automations` (a logical "rule"),
`triggers` (the keyword/post conditions), and `responses` (the DM
content). For v1 simplicity we enforce 1:1 — each automation has
exactly one trigger and one response. The schema allows N:1 if we
ever need it (an automation matching multiple keyword sets), but the
API endpoint creates them in lockstep.

### 3.2 Rate limit via Redis sliding-window sorted set

Per spec 006 lessons, BullMQ's per-key limiter is Pro-only. We
implement our own:

```
key: rate:dm:<igAccountId>
operation: ZADD with score=now, member=randomId; ZREMRANGEBYSCORE older than 1hr; ZCARD
if ZCARD > 185 → reject (re-enqueue with delay)
```

Sorted-set sliding window is the standard pattern. Each send adds
a member with timestamp score; old members are pruned; cardinality
is the current count. Operations are atomic if pipelined. We don't
need MULTI/EXEC because we tolerate slight races — being one or two
over the cap occasionally is fine (Meta's actual ceiling is 200, our
target is 185 with a 7.5% buffer).

### 3.3 24-hour messaging window — query the events table

Meta's policy: outbound DMs must be within 24h of the recipient's
last interaction (comment, DM, mention) with the connected page.
We check by querying `events` for any event from the recipient in
the last 24h. If none, the send is rejected with status `outsideWindow`.

This isn't perfect — a comment from 23h59m ago counts; an interaction
WE missed (e.g., webhook delivered to /dev/null while the worker was
down) wouldn't. But it's the best we can do without storing every
end-user interaction independently.

### 3.4 Send fails are logged, not retried automatically

If Meta returns 4xx, we mark `sends.status = 'failed'` and stop —
4xx usually means the user blocked us, the message tag is wrong, or
permissions changed. Retrying won't help.

If Meta returns 5xx or the request times out, BullMQ retries up to
3 times with exponential backoff. If still failing after 3 tries,
the job goes to BullMQ's failed set and `sends.status` stays at
`queued` — admin tooling (post-launch) can re-trigger.

### 3.5 The recipient's PSID comes from the webhook payload

Meta sends the comment author's IG user ID in the webhook payload
under `entry.changes[0].value.from.id` (or similar — the exact path
varies by event shape). We extract it and use it as the recipient.

For v1 we trust whatever Meta sends. Validation happens in the
adapter (Zod-parse the payload).

---

## 4. File layout

```
scripts/migrations/
└── 005-automations.sql                          # NEW

packages/shared/src/
├── db/
│   └── schema.ts                                 # MODIFIED
├── types/
│   └── tenant.ts                                 # MODIFIED
├── meta/
│   ├── rateLimit.ts                              # NEW — Redis sliding window
│   ├── rateLimit.test.ts                         # NEW
│   ├── messageWindow.ts                          # NEW — 24-hr check
│   └── messageWindow.test.ts                     # NEW
├── handlers/
│   ├── automations/
│   │   ├── createAutomation.ts                   # NEW
│   │   ├── listAutomations.ts                    # NEW
│   │   ├── updateAutomation.ts                   # NEW
│   │   └── deleteAutomation.ts                   # NEW
│   ├── processCommentEvent.ts                    # NEW — match + enqueue sends
│   └── sendDM.ts                                 # NEW — real implementation

apps/web/app/api/v1/automations/
├── route.ts                                      # NEW — POST + GET
└── [id]/route.ts                                 # NEW — PATCH + DELETE

apps/worker/src/jobs/
├── processEvent.ts                               # MODIFIED — call processCommentEvent
└── sendDM.ts                                     # MODIFIED — wire real impl
```

---

## 5. Data model — migration 005

```sql
CREATE TABLE IF NOT EXISTS public."automations" (
  "_id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igAccountId"  UUID NOT NULL REFERENCES public."igAccounts"("_id") ON DELETE CASCADE,
  "name"         TEXT NOT NULL,
  "trigger"      TEXT NOT NULL CHECK ("trigger" IN ('comment','storyReply','mention')),
  "status"       TEXT NOT NULL DEFAULT 'active'
                   CHECK ("status" IN ('active','paused','archived')),
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."triggers" (
  "_id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "automationId" UUID NOT NULL REFERENCES public."automations"("_id") ON DELETE CASCADE,
  "keywords"     TEXT[] NOT NULL,
  "matchMode"    TEXT NOT NULL DEFAULT 'contains'
                   CHECK ("matchMode" IN ('contains','exact','startsWith')),
  "postIds"      TEXT[]
);

CREATE TABLE IF NOT EXISTS public."responses" (
  "_id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"        UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "automationId"    UUID NOT NULL REFERENCES public."automations"("_id") ON DELETE CASCADE,
  "mode"            TEXT NOT NULL DEFAULT 'static'
                      CHECK ("mode" IN ('static','ai')),
  "template"        TEXT,
  "aiPrompt"        TEXT,
  "aiTone"          TEXT CHECK ("aiTone" IN ('friendly','professional','playful')),
  "fallbackTemplate" TEXT,
  "commentReply"    TEXT
);

CREATE TABLE IF NOT EXISTS public."sends" (
  "_id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igAccountId"   UUID NOT NULL REFERENCES public."igAccounts"("_id") ON DELETE CASCADE,
  "automationId"  UUID REFERENCES public."automations"("_id") ON DELETE SET NULL,
  "eventId"       UUID REFERENCES public."events"("_id") ON DELETE SET NULL,
  "recipientPsid" TEXT NOT NULL,
  "kind"          TEXT NOT NULL CHECK ("kind" IN ('dm','commentReply')),
  "content"       TEXT NOT NULL,
  "aiGenerated"   BOOLEAN NOT NULL DEFAULT false,
  "status"        TEXT NOT NULL CHECK ("status" IN ('queued','sent','failed','rateLimited','outsideWindow')),
  "metaMessageId" TEXT,
  "errorCode"     TEXT,
  "errorMessage"  TEXT,
  "attempt"       INT NOT NULL DEFAULT 1,
  "queuedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "sentAt"        TIMESTAMPTZ,
  "failedAt"      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_automations_tenantId_status" ON public."automations"("tenantId","status");
CREATE INDEX IF NOT EXISTS "idx_automations_igAccountId" ON public."automations"("igAccountId");
CREATE INDEX IF NOT EXISTS "idx_triggers_automationId" ON public."triggers"("automationId");
CREATE INDEX IF NOT EXISTS "idx_responses_automationId" ON public."responses"("automationId");
CREATE INDEX IF NOT EXISTS "idx_sends_tenantId_status" ON public."sends"("tenantId","status");
CREATE INDEX IF NOT EXISTS "idx_sends_igAccountId_sentAt" ON public."sends"("igAccountId","sentAt" DESC);
```

---

## 6. Acceptance criteria

### 6.1 Unit
- Rate limiter: under cap → allow; at cap → block; old entries pruned
- Message window: any event in last 24h → allow; none → block
- Schema parse rejects bad enum values

### 6.2 Integration
- POST /api/v1/automations creates 3 rows (automations, triggers, responses)
- GET /api/v1/automations returns the tenant's list (cross-tenant isolation)
- PATCH /api/v1/automations/{id} updates name/status
- DELETE cascades trigger + response rows
- processEvent picks up a comment event, matches keyword, enqueues send-dm
- sendDM calls Meta and writes a sends row

### 6.3 Build/lint/types
All clean.

---

## 7. Risks

1. **Real Meta send is hard to test.** We mock the adapter in tests
   that don't have a real connected IG account. The full e2e (real
   Meta call) is exercised post-launch with test users.
2. **Sliding-window race conditions.** With concurrency 5, two jobs
   for the same igAccount can read ZCARD < cap, both increment, and
   land at cap+1 or cap+2. Acceptable — we aim for 185 and Meta's
   real cap is ~200. Use `MULTI` if needed later.
3. **24-hour window edge case.** A user's first interaction
   triggering a DM at second 86399 of the window — Meta might
   reject if their clock differs. Buffer not implemented; revisit
   if rejection rate is high.

---

**END OF SPEC — proceeding to implementation.**
