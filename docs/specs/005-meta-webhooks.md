# Spec 005 — Meta Webhooks

> **MDD phase:** Document → implementation. Compressed loop.
> **Implements:** §Appendix B item 5 of `docs/engineering-plan.md`.
> **Depends on:** specs 001 + 002 + 003 + 004.

**Status:** Implementation in progress
**Branch:** `feat/spec-005-meta-webhooks`
**Last updated:** 2026-05-03

---

## 1. Goal

After this spec ships:

- Meta sends webhook events (comments, messages, story replies, etc.)
  to `POST /api/v1/webhooks/meta`. We verify the HMAC-SHA256 signature
  in `X-Hub-Signature-256` against the **app secret** before any
  handler logic runs. Bad signature → 401, no DB write.
- Meta verifies the webhook URL on the first registration via
  `GET /api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=...`.
- Verified events are persisted to `public.events` with a unique-index
  on `metaEventId` so duplicate deliveries are no-oped automatically.
- After persisting, we enqueue a `process-event` job to BullMQ. The
  worker (spec 006+) handles each event type.
- We respond 200 to Meta within 5 seconds of receipt (Meta retries on
  5xx or timeouts; we want to minimise retry storms).

---

## 2. Out of scope

- The worker that processes the queued events → spec 006.
- The actual comment-to-DM business logic → spec 007.
- Webhook subscription on the page (already done in spec 004's
  connect flow via `subscribePageToWebhooks`).
- Re-subscribe / "test webhook" admin button → post-launch.
- Dashboard view of incoming events → spec 011.

---

## 3. Architectural decisions

### 3.1 HMAC signature verification — first thing the route does

Before parsing JSON, before any handler logic, before any DB read, we
read the raw body and compute HMAC-SHA256 with the app secret. If the
signature doesn't match in a constant-time compare, we return 401 and
log a warning. Reasoning: malicious actors will probe webhook URLs,
and their requests must not enter our processing path.

Next.js App Router quirk: `request.json()` consumes the stream, after
which `request.text()` returns empty. We must read the raw body once
via `request.text()` and then `JSON.parse()` — the order matters.

### 3.2 Idempotency via unique index on `metaEventId`

Meta retries on 5xx and on timeouts. The same event can arrive 2-5+
times. The `events` table has a unique constraint on `metaEventId`. We
attempt to INSERT; on unique-violation we know it's a duplicate and
respond 200 immediately without re-queuing. This makes the entire path
idempotent without any handler-side logic.

The challenge: Meta does NOT send a stable event id in their payload.
We synthesise one by hashing the entry id + timestamp + change.field +
change.value.id (where applicable). Different webhook shapes get
different synthesis rules — we encapsulate this in
`computeMetaEventId()`.

### 3.3 Verification token (GET handshake)

Meta sends a one-shot GET to the webhook URL when registering. The
URL contains `hub.mode=subscribe`, `hub.verify_token=...`, and
`hub.challenge=...`. We compare the verify_token to a server-side
secret (`META_WEBHOOK_VERIFY_TOKEN`) and echo the `hub.challenge`
back as plain text on success. Failure: 403.

The verify token is configured in the Meta App dashboard alongside
the webhook URL. It's a separate secret from the App Secret — the
verify token authenticates Meta's GET, the App Secret signs Meta's
POSTs.

### 3.4 Queue dispatch is fire-and-forget

After persisting the event to `public.events`, we enqueue a
`process-event` job to BullMQ but do NOT await its completion before
responding 200 to Meta. Meta gives us 5 seconds; queue write should
take <100ms. The worker (spec 006) handles processing async.

### 3.5 No tenant context at webhook time

Webhooks arrive WITHOUT a session cookie (Meta is the caller). We
resolve the tenant from `igAccounts.igUserId → tenants.tenantId`
during processing in the worker, not here. The `events` row stores
`tenantId: null` until the worker resolves it.

This is safe because `events` is queried only by the worker (which
constructs its own ctx from the row) or by admin tools (which get a
synthetic admin ctx). Handlers in the request path NEVER read `events`.

---

## 4. File layout

```
scripts/migrations/
└── 004-events.sql                                 # NEW

packages/shared/src/
├── db/
│   └── schema.ts                                   # MODIFIED — add EventSchema
├── types/
│   └── tenant.ts                                   # MODIFIED — add Event type
├── meta/
│   ├── verifySignature.ts                          # NEW — HMAC-SHA256
│   ├── verifySignature.test.ts                     # NEW
│   └── eventId.ts                                  # NEW — synthesise stable event id
└── handlers/
    └── webhooks/
        └── ingestMetaWebhook.ts                    # NEW — full ingest path
└── env.ts                                          # MODIFIED — add META_WEBHOOK_VERIFY_TOKEN

apps/web/
└── app/api/v1/webhooks/meta/
    └── route.ts                                    # NEW — GET (handshake) + POST (ingest)

tests/
└── integration/
    └── webhookIngest.test.ts                       # NEW — round-trip with real DB
```

---

## 5. Data model — `events`

### Migration 004

```sql
CREATE TABLE IF NOT EXISTS public."events" (
  "_id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          UUID REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "metaEventId"       TEXT NOT NULL UNIQUE,
  "kind"              TEXT NOT NULL
                        CHECK ("kind" IN (
                          'comment','message','storyReply','messageReaction','mention'
                        )),
  "igAccountId"       UUID REFERENCES public."igAccounts"("_id") ON DELETE SET NULL,
  "payload"           JSONB NOT NULL,
  "signatureVerified" BOOLEAN NOT NULL,
  "receivedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt"       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_events_tenantId_kind_receivedAt"
  ON public."events"("tenantId", "kind", "receivedAt");
CREATE INDEX IF NOT EXISTS "idx_events_processedAt_receivedAt"
  ON public."events"("processedAt", "receivedAt");
```

`tenantId` is nullable because at insert-time we may not yet know the
tenant (we resolve via igAccounts in the worker). `processedAt` is
null until the worker finishes — index helps the worker scan unprocessed.

---

## 6. Endpoints

### `GET /api/v1/webhooks/meta` — handshake

Used once when configuring the webhook in the Meta dashboard. Query
params from Meta:
- `hub.mode=subscribe`
- `hub.verify_token=<our token>`
- `hub.challenge=<random string>`

Return: `text/plain` body of `hub.challenge` if `verify_token` matches
ours; `403 Forbidden` otherwise.

### `POST /api/v1/webhooks/meta` — ingest

1. Read raw body with `request.text()`.
2. Compute HMAC-SHA256 over the raw body using `META_APP_SECRET`.
3. Compare to `X-Hub-Signature-256` header (constant-time). Reject 401.
4. Parse JSON.
5. For each entry × each change in the payload:
   - Synthesise `metaEventId` via `computeMetaEventId(entry, change)`.
   - Determine `kind` from change.field (e.g. `comments` → 'comment').
   - Look up `igAccountId` from `igAccounts.igUserId` (best-effort —
     null if not found, indicating an event for an unconnected account
     which we still log).
   - INSERT INTO events (...). On unique violation: skip (already seen).
6. Enqueue a `process-event` job per non-duplicate inserted row.
7. Return 200 with `{ ok: true, accepted: N }`.

Total budget: under 5s. Under 1s in steady state.

---

## 7. Acceptance criteria

### 7.1 Unit
- HMAC verify: valid signature passes, tampered fails, missing header
  fails, wrong secret fails, malformed signature fails.
- Constant-time compare: timing-safe comparison used (verified via
  `timingSafeEqual` in implementation).
- `computeMetaEventId`: same payload → same id; different payloads →
  different ids.

### 7.2 Integration
- Insert event with valid signature; verify row in `events` with
  `signatureVerified: true`.
- Re-send same event (same `metaEventId`); verify only one row exists
  (unique index dedupe).
- Verify token GET handshake: correct token returns challenge body;
  wrong token returns 403.

### 7.3 Build/lint/types
All clean.

---

## 8. Risks / open questions

1. **Webhook URL must be HTTPS for Meta to deliver.** Locally we use
   ngrok tunnel; production uses Vercel domain. Both are HTTPS.

2. **Meta dashboard webhook configuration is a manual step.** The
   user must:
   - Generate a verify token (`openssl rand -hex 16`)
   - Add `META_WEBHOOK_VERIFY_TOKEN` to `.env`
   - In Meta dashboard → Webhooks → Add Subscription → Page →
     Callback URL: `https://<ngrok-url>/api/v1/webhooks/meta`
   - Verify Token: same value as `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to fields: `comments`, `messages`, `message_reactions`,
     `mentions`

3. **Local dev requires ngrok.** Static-domain ngrok ($8/mo) keeps the
   webhook URL stable across restarts; free tier rotates the URL on
   each restart, which means re-pasting it into Meta dashboard each time.

4. **The synthesised `metaEventId` is a hash of payload fields.** If
   Meta changes their payload shape, our id would change and we'd lose
   dedupe. Test coverage prevents silent drift.

5. **Worker concurrency on event processing**. Spec 006 sets up the
   worker with concurrency 5 (per engineering plan). Each event gets
   one job; worker resolves tenant + igAccount and dispatches.

6. **Webhook fields on app level**. After Meta App Review, we'll
   subscribe to webhook fields at the App level (one-time configuration)
   so all pages our app is connected to deliver events automatically.

---

## 9. Definition of done

- Migration 004 applied
- All §7 tests pass
- typecheck/lint/build clean
- Branch fast-forward merged to master

---

**END OF SPEC — proceeding to implementation.**
