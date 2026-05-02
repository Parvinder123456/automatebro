# Spec 004 — Meta OAuth + Instagram Account Connect

> **MDD phase:** Document. Compressed loop — proceeding directly to
> implementation per user directive.
> **Implements:** §Appendix B item 4 of `docs/engineering-plan.md`.
> **Depends on:** specs 001 + 002 + 003.

**Status:** Draft, in implementation
**Branch:** `feat/spec-004-meta-oauth`
**Last updated:** 2026-05-03

---

## 1. Goal

After this spec ships, a logged-in tenant on `/app/integrations` can:

- Click **Connect Instagram** → redirect to Meta's OAuth dialog.
- Approve permissions on Meta → redirect back to AutomateBro.
- See their connected IG Business account(s) listed on `/app/integrations`.
- Click **Disconnect** to remove an account.

Under the hood:

- We exchange the OAuth code for a long-lived Page Access Token.
- We resolve which Facebook Pages are connected to Instagram Business
  accounts (only Business/Creator accounts can use the Graph API; we
  reject personal Instagram).
- We encrypt the Page Access Token with **AES-256-GCM** before storing
  in `public.igAccounts`.
- We subscribe to webhook fields (`comments`, `messages`,
  `message_reactions`, `mentions`) on each connected page — best effort,
  since the webhook endpoint itself ships in spec 005.

---

## 2. Out of scope

- The webhook receive endpoint (`/api/v1/webhooks/meta`) → spec 005.
- Token refresh on expiry (long-lived Page Access Tokens last ~60 days
  for Pages but **never expire** for system users; we'll handle
  rotation if/when we need it; private beta is short enough that we
  can re-connect manually).
- Multi-account management UI (switching, settings, etc.) — v1 just
  shows a list with disconnect.
- Meta App Review submission — that's a manual process you'll do in
  parallel.
- Race conditions on simultaneous connect (the unique constraint on
  `(tenantId, igUserId)` handles this naturally — second connect = noop).

---

## 3. Architectural decisions

### 3.1 AES-256-GCM with env-var key (v1)

`META_TOKEN_KEY` is a base64-encoded 32-byte random value, stored in
`.env` and Vercel/Railway env config. The key is loaded ONCE at process
start via `loadEnv()`, decoded to raw 32 bytes, and held in memory.

**Why not Supabase Vault for v1:** Vault adds a network round-trip per
encryption operation and complicates local dev (you'd need Vault keys
mocked in tests). For private beta, env-var-based key is industry-
standard. Migration to Vault is a one-file change in
`packages/shared/src/meta/tokenCrypto.ts` — defer until production
launch.

**Format on disk** (per `igAccounts` row):
- `accessTokenCiphertext`: bytea (variable length)
- `accessTokenIv`: bytea (12 bytes — GCM standard)
- `accessTokenTag`: bytea (16 bytes — GCM auth tag)

Each token gets a fresh random IV. The auth tag prevents tampering —
if the ciphertext or AAD is modified, decrypt() throws.

### 3.2 OAuth flow uses signed state cookie (CSRF defence)

The `state` parameter Meta echoes back is signed with HMAC-SHA256 using
`META_APP_SECRET` (already a server-only secret). On callback we verify
the signature before exchanging the code. This prevents:
- Attacker tricking a logged-in tenant into completing OAuth for the
  attacker's IG account (they'd need to forge the state).
- Stale callback replays (state includes a timestamp + 5-min window).

### 3.3 Webhook subscription is best-effort in spec 004

After saving `igAccounts`, we call `POST /{page-id}/subscribed_apps`
with the four webhook fields. If Meta returns an error (network blip,
permissions issue), we log a warning and continue — the connect still
succeeds from the tenant's POV. Spec 005 adds a "re-subscribe" path
for accounts that missed it.

### 3.4 Single-account-per-page-per-tenant

The unique constraint on `igAccounts(tenantId, igUserId)` means:
- Tenant A connecting their account twice = upsert (refresh token, no dupe).
- Tenant A and Tenant B connecting the SAME IG account = both get rows
  (different `tenantId` makes them distinct). This is the desired
  behaviour for agency tenants managing client accounts.

---

## 4. File layout

```
scripts/migrations/
└── 003-igaccounts.sql                          # NEW

packages/shared/src/
├── db/
│   └── schema.ts                                # MODIFIED — add IgAccountSchema
├── types/
│   └── tenant.ts                                # MODIFIED — add IgAccount type
├── meta/
│   ├── tokenCrypto.ts                           # NEW — AES-256-GCM
│   ├── tokenCrypto.test.ts                      # NEW — round-trip + tamper tests
│   ├── oauth.ts                                 # NEW — code → token exchange
│   └── oauth.test.ts                            # NEW — with mocked HTTP
├── adapters/
│   └── meta.ts                                  # NEW — typed Graph API client
├── handlers/
│   └── igAccounts/
│       ├── connectIgAccount.ts                  # NEW — full callback flow
│       ├── listIgAccounts.ts                    # NEW — list for /app/integrations
│       └── disconnectIgAccount.ts               # NEW — delete + revoke
└── env.ts                                       # MODIFIED — META_* required

apps/web/
├── app/
│   ├── api/v1/
│   │   ├── auth/meta/
│   │   │   ├── start/route.ts                   # NEW — initiate OAuth
│   │   │   └── callback/route.ts                # NEW — handle callback
│   │   └── igAccounts/
│   │       ├── route.ts                         # NEW — GET list
│   │       └── [id]/route.ts                    # NEW — DELETE
│   └── (app)/app/integrations/
│       └── page.tsx                             # NEW — connect UI

tests/
├── integration/
│   └── tokenCrypto.test.ts                      # NEW — uses real env key
└── e2e/
    └── integrations.spec.ts                     # NEW — UI flow (mock Meta)
```

---

## 5. Data model — `igAccounts`

### Migration 003

```sql
CREATE TABLE IF NOT EXISTS public."igAccounts" (
  "_id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"                  UUID NOT NULL REFERENCES public."tenants"("_id") ON DELETE CASCADE,
  "igUserId"                  TEXT NOT NULL,
  "igUsername"                TEXT NOT NULL,
  "pageId"                    TEXT NOT NULL,
  "pageName"                  TEXT,
  "accessTokenCiphertext"     BYTEA NOT NULL,
  "accessTokenIv"             BYTEA NOT NULL,
  "accessTokenTag"            BYTEA NOT NULL,
  "tokenKeyVersion"           INT NOT NULL DEFAULT 1,
  "tokenExpiresAt"            TIMESTAMPTZ,
  "scopes"                    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "webhookSubscribedAt"       TIMESTAMPTZ,
  "connectedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "disconnectedAt"            TIMESTAMPTZ,
  UNIQUE ("tenantId", "igUserId")
);

CREATE INDEX IF NOT EXISTS "idx_igAccounts_tenantId" ON public."igAccounts"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_igAccounts_igUserId" ON public."igAccounts"("igUserId");
```

`tokenKeyVersion` is reserved for future key rotation (spec ~14). Defaults
to 1; rotation introduces a new key, re-encrypts on next refresh, bumps
this column to 2.

---

## 6. OAuth flow (concrete)

```
[browser]                          [our server]                       [Meta]

1. Click "Connect IG"
   GET /api/v1/auth/meta/start ─────►
                                    Generate state = HMAC(timestamp + tenantId, APP_SECRET)
                                    Set Set-Cookie: meta_oauth_state=<state>
                                    302 → https://www.facebook.com/v21.0/dialog/oauth?
                                              client_id=...
                                              &redirect_uri=.../api/v1/auth/meta/callback
                                              &state=<state>
                                              &scope=instagram_basic,instagram_manage_messages,
                                                     instagram_manage_comments,pages_show_list,
                                                     pages_read_engagement,business_management
   (browser follows) ──────────────────────────────────────────────────►
                                                                          User approves
   ◄─────────────────────────────── 302 GET /api/v1/auth/meta/callback?code=...&state=...
                                    Verify cookie matches state, reject if not
                                    Verify HMAC signature on state (CSRF defence)
                                    Verify timestamp within 5-min window
                                    POST /v21.0/oauth/access_token (exchange code) ──►
                                    ◄─── short-lived user access_token
                                    GET /v21.0/oauth/access_token?grant_type=fb_exchange_token ──►
                                    ◄─── long-lived user access_token (~60 days)
                                    GET /v21.0/me/accounts ──►
                                    ◄─── pages[] with their access_tokens
                                    For each page:
                                      GET /v21.0/{pageId}?fields=instagram_business_account ──►
                                      ◄─── ig_business_account.id (or null if no IG)
                                    For each IG-enabled page:
                                      GET /v21.0/{igUserId}?fields=username ──►
                                      ◄─── { username }
                                      Encrypt(pageAccessToken, META_TOKEN_KEY)
                                      INSERT INTO igAccounts (...)
                                      POST /v21.0/{pageId}/subscribed_apps?subscribed_fields=...
                                              (best-effort)
                                    302 → /app/integrations?connected=N
```

---

## 7. Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/auth/meta/start` | tenant | Initiate OAuth. Sets state cookie, 302 to Meta. |
| GET | `/api/v1/auth/meta/callback` | tenant | Handle Meta's redirect. Verify state, exchange code, save accounts, 302 to /app/integrations. |
| GET | `/api/v1/igAccounts` | tenant | List connected accounts for current tenant. |
| DELETE | `/api/v1/igAccounts/{id}` | tenant | Disconnect (soft-delete via `disconnectedAt`). |

Handler-level `requireTenant(ctx)` enforces tenant scope. `repo.queryMany('igAccounts', {}, ctx)` auto-filters by `tenantId`.

---

## 8. Acceptance criteria

### 8.1 Unit (Vitest)
- Token crypto round-trip: encrypt(plaintext) → decrypt(ciphertext, iv, tag) === plaintext
- Tampered ciphertext fails: decrypt() throws if any byte changes
- Tampered tag fails: decrypt() throws
- Wrong key fails: decrypt() throws if key bytes differ by 1
- IV uniqueness: 1000 encryptions yield 1000 distinct IVs
- IgAccountSchema rejects bad scope arrays, empty igUserId, etc.
- State cookie HMAC: signed state survives round-trip, tampered fails, expired fails

### 8.2 Integration (Vitest, real Postgres)
- Insert + retrieve igAccount (encrypted token round-trips)
- DELETE soft-deletes (disconnectedAt set, row preserved for audit)
- Cross-tenant isolation: tenant B can't see tenant A's igAccounts via repo

### 8.3 E2E (Playwright)
- `/app/integrations` renders for an authenticated tenant
- Empty state shows "No accounts connected yet" + Connect button
- Clicking Connect redirects to /api/v1/auth/meta/start (we don't follow into Meta)
- After a fixture-inserted igAccount row, the page shows the username
- Disconnect button calls DELETE and the row disappears

### 8.4 Build/lint/types
- All clean.

---

## 9. Risks / open questions

1. **Real OAuth flow can't be fully E2E-tested.** Meta blocks browser
   automation through their auth screens. We test up to the redirect to
   Meta, then directly fixture the resulting `igAccounts` row to test
   the post-callback UI. Meta App Review will verify the live flow.

2. **App Review approval gates real users.** Until Meta approves
   `instagram_manage_messages` + `instagram_manage_comments` (4–8 weeks),
   only test users added in the Meta dashboard can complete OAuth.
   Document this in the dashboard error path.

3. **Token key rotation deferred.** `tokenKeyVersion` column is reserved
   but unused in v1. Spec ~14 will add rotation.

4. **Webhook subscription is best-effort.** A page where subscription
   failed will not deliver events. Spec 005 adds a "test webhook"
   button + re-subscribe action.

5. **No way to refresh long-lived tokens.** They last ~60 days but never
   auto-refresh. After 60 days the user has to re-connect. Acceptable
   for private beta; production may need a refresh job.

---

## 10. Definition of done

- Migration 003 applied to dev Supabase
- All test categories pass
- typecheck/lint/build clean
- Branch fast-forward merged to master

---

**END OF SPEC — proceeding directly to implementation per user directive.**
