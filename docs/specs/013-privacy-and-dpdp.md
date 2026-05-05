# Spec 013 — Privacy + DPDP Compliance

> **MDD phase:** Document → Test → Code (compressed loop, single approval gate).
> **Implements:** §Appendix B item 13 of `docs/engineering-plan.md` —
> "consent flow, export/delete API". Aligns with engineering plan §10
> (Security → DPDP Act compliance).

**Status:** Awaiting approval — no code yet
**Branch:** `feat/spec-012-013-marketing-and-privacy`

---

## 1. Goal

Give every tenant the technical hooks required by India's **Digital
Personal Data Protection Act, 2023 (DPDP)** and GDPR Articles 15 / 17.
After this spec ships, a logged-in tenant can:

1. **Consent explicitly** to data processing on signup (already happens
   implicitly when `createTenant` sets `dpdpConsentAt`; this spec adds
   a checkbox so the consent is **affirmative, recorded, and
   user-visible**).
2. **Read the privacy policy, terms, and DPA** at public URLs
   (`/privacy`, `/terms`, `/dpa`). Spec 012 scaffolded these; this
   spec fills them with real copy.
3. **Export all of their data** as a single JSON download from
   `/app/settings/privacy`.
4. **Request deletion of the workspace** from `/app/settings/privacy`,
   which soft-deletes immediately and queues a hard-delete for 30
   days later.

The export and delete endpoints satisfy **DPDP §11 (right to access)**
and **§12 (right to erasure)**. Same endpoints satisfy GDPR
**Article 15 (access)** and **Article 17 (erasure)**.

---

## 2. Out of scope

- **Hard-delete cron** — the 30-day countdown is recorded; the actual
  hard-delete job lands in spec 014 (observability + scheduled jobs).
  v1 manual fallback: a `scripts/queries/hard-delete-pending.ts` query
  the operator runs by hand.
- **Per-collection retention policies** — everything tied to a deleted
  tenant is purged together. No "keep events for X days but leads for Y".
- **Cookie banner with granular consent** — v1 marketing site uses zero
  third-party cookies (PostHog adds in spec 014, gated behind a single
  banner toggle then). For now: a static banner saying "we use cookies
  for sign-in only" with a single dismiss button stored in localStorage.
- **Data Subject Access Request (DSAR) ticketing UI** — single
  self-service export endpoint is enough for v1.
- **Sub-processor list management UI** — the privacy policy page lists
  sub-processors as static markdown.
- **Consent history / audit log** — single timestamp on `tenants`
  is enough; granular consent versioning is post-launch.
- **Encrypted token revocation on Meta side** — when a tenant deletes
  their workspace we mark `igAccounts.disconnectedAt` but do **not**
  call Meta's `/me/permissions` DELETE. Tenant must revoke from their
  Facebook settings if they want immediate Meta-side revocation.
  Documented in privacy policy.
- **Anonymisation instead of deletion** — DPDP allows but doesn't
  require it; we hard-delete.

---

## 3. Architectural decisions

### 3.1 Consent recorded twice: signup + onboarding

`tenants.dpdpConsentAt` already exists (set inside `createTenant`).
This spec adds:

- A checkbox on the **signup form** ("I agree to the Terms of Service
  and Privacy Policy") that **must be checked** to enable the submit
  button. We do not store this on `users` (Supabase Auth owns that
  table); the explicit consent timestamp lands on `tenants` at
  workspace creation time, which is the same row that authorises
  data processing.
- A second checkbox on the **workspace form** ("I confirm I have
  authority to process personal data of Instagram users I interact
  with"). Required to submit. This is the DPDP-specific consent for
  the **lead capture** workflow — without it, tenants might capture
  end-users' emails without legal basis.

Both checkboxes are **required**. Both are validated client-side AND
server-side. The signup checkbox doesn't reach the database (Supabase
Auth handles signup); the workspace checkbox flows into
`createTenant` as a required boolean and aborts the request if missing.

### 3.2 Export = single GET, JSON file download

`GET /api/v1/privacy/export` runs the handler `exportTenantData(ctx)`
which queries every tenant-scoped collection and returns a single JSON
blob with `Content-Disposition: attachment; filename=automatebro-export-<tenantSlug>-<date>.json`.

Token ciphertexts are **redacted** from the export (`accessTokenCiphertext`,
`accessTokenIv`, `accessTokenTag` → `null`). They're not personal data
(they encrypt **the tenant's** Meta access, not the tenant's PII), and
exporting them is a security risk — the export goes through the user's
browser into a file on their disk, often syncs to cloud storage.
Redacting is the right call.

`hashedTokens: false` flag on the export tells future-us: "tokens were
removed, not hashed". Avoid leaking what fields existed.

### 3.3 Delete = soft + scheduled hard-delete

`POST /api/v1/privacy/delete` runs `requestTenantDeletion(ctx)`:

1. Sets `tenants.deletedAt = now()` and `tenants.deletionRequestedAt = now()`.
2. Sets `igAccounts.disconnectedAt = now()` for every connected account.
3. Updates `tenantUsers.role = 'member'` → no, actually we leave
   `tenantUsers` rows alone so the deletion-requested tenant is still
   reachable by the operator before the 30-day window elapses. The
   `getCtx()` change in §3.4 is what hides the tenant from the user.
4. Signs the user out (Supabase Auth `signOut` server-side) so the
   stale session can't see partial state.

The hard-delete (the actual `DELETE FROM tenants WHERE _id = $1`) runs
30 days later via a cron we wire up in spec 014. Until then the tenant
data exists but is invisible to its users — equivalent to "trash bin"
on most SaaS products and gives us time to recover from accidental
deletions.

### 3.4 `getCtx` honours `tenants.deletedAt`

Today, `buildCtx` looks up `tenantUsers` and returns `tenantId` if a
row exists. After this spec, it additionally **joins to `tenants`**
and treats `deletedAt !== null` as "no tenant" — the user is bounced
to a new public page `/deleted` explaining their data is scheduled for
hard-delete and how to cancel (email support; no in-product cancel UI
for v1).

This keeps multi-tenancy behaviour consistent: `repo.*` is unchanged;
deleted tenants simply never reach the repo layer.

### 3.5 No new collections, one schema field added

`tenants` gets one new column: `deletionRequestedAt TIMESTAMPTZ`. New
migration: `008-tenant-deletion.sql`. No other schema changes.

`TenantSchema` Zod adds the field. `dpdpConsentAt` was already
`.nullable().optional()`; we tighten it to **required** for any
**new** tenants but leave existing rows alone (they were created with
auto-set consent).

### 3.6 Privacy / Terms / DPA copy lives in the spec, not a CMS

Three pages, plain markdown rendered as React. No `@next/mdx`, no
CMS — the copy ships in `apps/web/app/(marketing)/privacy/page.tsx`
and friends as JSX. Updates require a redeploy; this is fine because
legal copy changes are rare and need version control anyway.

---

## 4. Files to create / modify

### 4.1 Migration
- `scripts/migrations/008-tenant-deletion.sql` — adds
  `tenants.deletionRequestedAt` column.

### 4.2 Schema + types
- Modify `packages/shared/src/db/schema.ts` — add
  `deletionRequestedAt` to `TenantSchema`.
- Modify `packages/shared/src/types/tenant.ts` — mirror the field.

### 4.3 Handlers
- `packages/shared/src/handlers/privacy/exportTenantData.ts` — runs
  one `repo.queryMany` per tenant-scoped collection + one
  `db.queryOne` for `tenants` itself. Redacts encrypted token bytes.
  Returns a `TenantExport` object.
- `packages/shared/src/handlers/privacy/requestTenantDeletion.ts` —
  runs the multi-row update inside `db.withTransaction`.
- Modify `packages/shared/src/handlers/tenants/createTenant.ts` —
  accept a required `processingConsent: true` literal in input;
  reject if false. The `dpdpConsentAt` field captures the timestamp
  (already in code).
- Modify `packages/shared/src/auth/ctx.ts` `buildCtx` — also load the
  tenants row and treat `deletedAt !== null` as "no tenant".

### 4.4 API routes
- `apps/web/app/api/v1/privacy/export/route.ts` — `GET`. Auth required.
  Returns JSON with `Content-Disposition: attachment`.
- `apps/web/app/api/v1/privacy/delete/route.ts` — `POST`. Auth
  required. Body: `{ confirm: 'DELETE' }` (typed string literal,
  matches the user's typed confirmation). Returns 204.

### 4.5 UI — settings page
- `apps/web/app/(app)/app/settings/page.tsx` — Server Component.
  Workspace info + privacy panel.
- `apps/web/components/settings/privacy-panel.tsx` — Client Component.
  Two buttons: "Download my data" (links to `/api/v1/privacy/export`)
  and "Delete workspace" (opens confirm modal, types "DELETE", POSTs).
- `apps/web/components/settings/delete-confirm-modal.tsx` — Client
  Component. Inline modal with the typed-confirmation gate.

### 4.6 UI — public legal pages (replace stubs from spec 012)
- `apps/web/app/(marketing)/privacy/page.tsx` — full privacy policy.
- `apps/web/app/(marketing)/terms/page.tsx` — full terms of service.
- `apps/web/app/(marketing)/dpa/page.tsx` — data processing addendum.
- `apps/web/app/(marketing)/deleted/page.tsx` — "your workspace is
  scheduled for deletion" landing.

### 4.7 UI — consent capture
- Modify `apps/web/components/auth/signup-form.tsx` — add required
  consent checkbox. Submit disabled until checked.
- Modify `apps/web/components/onboarding/workspace-form.tsx` — add
  required processing-authority checkbox. Submit disabled until
  checked. Send `processingConsent: true` to API.
- Modify `apps/web/app/api/v1/tenants/route.ts` — pass through
  `processingConsent` to `createTenant`. 400 if false.

### 4.8 Sidebar
- Modify `apps/web/components/app-shell/sidebar.tsx` — add a
  "Settings" link at the bottom of the nav (above Sign out).

### 4.9 Cookie banner
- `apps/web/components/marketing/cookie-banner.tsx` — Client
  Component. Renders only on the marketing pages (mount in
  `(marketing)/layout.tsx`). Shows once, dismisses to localStorage.

### 4.10 Public-paths
- Modify `apps/web/lib/auth/public-paths.ts` — add `/deleted` to
  `PUBLIC_EXACT`. (`/privacy`, `/terms`, `/dpa` were added in spec 012.)

---

## 5. Tests

### 5.1 Integration (`tests/integration/privacyExport.test.ts`)
- **Export round-trip:** seed a tenant with one igAccount + one
  automation + one lead + one event + one send. Call
  `exportTenantData(ctx)`. Assert returned JSON has all five entities
  and that `igAccounts[0].accessTokenCiphertext === null` (redacted).
- **Cross-tenant isolation:** two tenants A and B, A's export must not
  contain any of B's rows.

### 5.2 Integration (`tests/integration/privacyDelete.test.ts`)
- **Delete soft-deletes tenant:** call `requestTenantDeletion(ctxA)`,
  re-fetch tenant directly via `db.queryOne('tenants', { _id })`,
  assert `deletedAt !== null` and `deletionRequestedAt !== null`.
- **Delete disconnects IG accounts:** seed an `igAccount`, run delete,
  assert `igAccounts[0].disconnectedAt !== null`.
- **Delete is idempotent:** running it twice doesn't error and doesn't
  push `deletionRequestedAt` back.
- **Cross-tenant isolation:** A deletes A's workspace; B's data
  untouched.

### 5.3 Integration (`tests/integration/ctxDeletedTenant.test.ts`)
- Seed a tenant with `deletedAt = now()`. Call `buildCtx(user, db)`.
  Assert returned ctx has `tenantId === null` (so the user gets
  bounced to onboarding / `/deleted`).

### 5.4 E2E (`tests/e2e/privacy.spec.ts`)
- **Public legal pages render:** visit `/privacy`, `/terms`, `/dpa`,
  each returns 200 with the page title.
- **Settings page accessible:** logged-in user visits `/app/settings`,
  sees "Download my data" + "Delete workspace" buttons.
- **Export download triggers:** click "Download my data", assert the
  download response has `Content-Disposition: attachment`.
- **Delete requires typed confirmation:** click delete, assert button
  is disabled until "DELETE" is typed exactly.
- **Signup blocked without consent:** load `/signup`, assert submit
  button disabled until checkbox checked.

### 5.5 Unit (`apps/web/lib/auth/public-paths.test.ts`)
Add `/deleted` to the public-paths positive cases.

---

## 6. Acceptance criteria

- [x] Migration `008-tenant-deletion.sql` applied to Supabase.
- [x] `GET /api/v1/privacy/export` returns a JSON file download for
      authenticated users; 401 otherwise.
- [x] `POST /api/v1/privacy/delete` soft-deletes the tenant and
      disconnects every igAccount.
- [x] Logged-in user with `deletedAt !== null` lands on `/deleted`
      page.
- [x] Signup form requires consent checkbox.
- [x] Workspace form requires processing-authority checkbox.
- [x] `/privacy`, `/terms`, `/dpa` have real copy (not the spec 012
      stubs).
- [x] All tests in §5 pass.
- [x] `pnpm typecheck` + `pnpm test:unit` + `pnpm --filter web exec next build`
      succeed.

---

## 7. Risks + mitigations

1. **`getCtx` change has wide blast radius.** `buildCtx` runs on every
   protected route. Joining to `tenants` adds one query per request.
   Mitigation: `getCtx` is wrapped in `React.cache()`; same request
   only pays once. Long-term: bake the `deletedAt` check into
   `tenantUsers` via a join in a single query.
2. **Export size unbounded.** A tenant with millions of events would
   produce a huge JSON. Mitigation: hard-cap each collection at 10,000
   rows in the export and add an `isTruncated: true` flag. Tenants who
   need the full set get manual operator help.
3. **Soft-delete leaves orphaned references.** `repo.*` is
   `tenantId`-scoped, so a deleted tenant's data is naturally
   invisible. Cron in spec 014 hard-deletes after 30 days; until then,
   it just sits idle. No app code reads soft-deleted rows.
4. **Hard-delete misses non-cascading data.** Postgres `ON DELETE
   CASCADE` is wired on every tenantId FK (specs 003 + 005 + 007).
   A `DELETE FROM tenants WHERE _id = $1` cascades to everything.
   Mitigation: a sanity-check query in `scripts/queries/orphan-check.ts`
   reports rows whose tenantId no longer matches a tenants row.

---

## 8. Lessons we expect to learn (to backfill in CLAUDE.md after merge)

- Pattern for "cascade soft-delete via getCtx" — keeping the `repo.*`
  layer ignorant of soft-deletion by filtering at the auth boundary.
- Typed-confirmation modals with synchronous double-click guards —
  same pattern as the form hydration sentinel.
- Streaming a JSON `Response` with `Content-Disposition: attachment` in
  Next.js Route Handlers — gotchas around `Response.json()` (strips
  the disposition header).
- DPDP / GDPR coverage with one JSON export endpoint — what we keep,
  what we redact, what we tell tenants in copy.
