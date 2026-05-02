# Spec 003 — Tenants & Users

> **MDD phase:** Document. Awaiting approval.
> **Implements:** §Appendix B item 3 of `docs/engineering-plan.md`.
> **Depends on:** specs 001 + 002 (workspaces, StrictDB, Supabase Auth).
> **Foundation for:** every subsequent spec — multi-tenancy starts here.

**Status:** Draft, awaiting approval
**Branch:** `feat/spec-003-tenants-users`
**Last updated:** 2026-05-02

---

## 1. Goal

Add the multi-tenant data layer. After this spec ships:

- A signed-in user with no tenant lands on `/onboarding`, fills "workspace
  name", clicks **Create**, and is redirected to `/app/dashboard`.
- The act of clicking **Create** writes three rows: one `tenants`, one
  `users` (mirrored from Supabase Auth), one `tenantUsers` with role
  `owner`.
- A signed-in user with a tenant who hits `/onboarding` is redirected to
  `/app/dashboard`.
- A signed-in user without a tenant who hits `/app/*` is redirected to
  `/onboarding` (closes the gap flagged in spec 002 §11.3).
- Every server handler can call `getCtx()` to retrieve
  `{ userId, tenantId, role }`. Calling `repo.queryOne('<collection>', filter, ctx)`
  auto-merges `{ tenantId: ctx.tenantId }` into the filter. **It is
  impossible to query another tenant's data through `repo`.**
- A SQL migration system (`pnpm db:migrate`) creates the three tables,
  records applied migrations in a `_migrations` table, and is idempotent.
- The health endpoint upgrades from "shallow client check" to a real
  `db.count('tenants', {})` round-trip (closes spec 001 §9 deferred work).

---

## 2. Out of scope (explicit)

Deferred to later specs:

- **Tenant invitation flow** (one user inviting another into their workspace)
  → spec 003.5 (post-launch). v1 is single-user-per-tenant.
- **Role enforcement** (`admin` / `member` distinction). The role field is
  stored, but every gate just checks `ctx.userId` exists. Granular RBAC
  comes with invitations.
- **Tenant deletion / soft-delete cascade** → spec 013 (privacy / DPDP).
- **Workspace switching UI** (a user belonging to multiple tenants picking
  the active one) → post-launch.
- **Audit log of tenant-membership changes** → post-launch.
- **`/api/v1/igAccounts`, `/api/v1/automations`, etc.** — those land in
  their respective specs (004, 007). Spec 003 only delivers the
  foundation that *those* specs will plug into.
- **Postgres Row-Level Security (RLS)** — engineering plan §7 explicitly
  defers RLS in favour of the three application-layer guards in this
  spec.

---

## 3. Prerequisites

None beyond specs 001 + 002. The Supabase project from spec 001 §3.1 +
filled `.env` are sufficient. No new accounts, no Auth-config changes.

---

## 4. Architectural decisions

### 4.1 SQL migrations — hand-written, recorded in `_migrations` table

We maintain numbered SQL files in `scripts/migrations/NNN-*.sql`. A
TypeScript runner (`scripts/db-migrate.ts`, exposed via `pnpm db:migrate`)
applies each one in transaction-isolated batches and records the version
in `_migrations`. This is **idempotent**: re-running skips already-applied
migrations.

Why not Supabase CLI:
- Adds Docker dependency for local dev.
- Forces a parallel "Supabase migrations" tree separate from our app code.
- We already have one place for ad-hoc DB scripts (`scripts/db-query.ts`);
  migrations fit that mental model.

Why not Drizzle / Prisma / Knex:
- Forbidden by `CLAUDE.md` Rule #3.
- Schema lives in `packages/shared/src/db/schema.ts` (StrictDB
  registration with Zod) — duplicating it in a tool's DSL adds drift.

Why not `db.ensureIndexes()` only:
- StrictDB's `ensureIndexes()` only creates indexes, not tables. We need
  raw `CREATE TABLE` first, then StrictDB's index management on top.

The runner enforces:
- Transaction-per-migration (atomic apply).
- File checksum recorded — if a previously-applied migration's contents
  change, the runner refuses to proceed (prevents accidental edits to
  shipped migrations).
- Strictly numbered ordering (`001-`, `002-`, ...). Non-sequential gaps
  refuse to run.

### 4.2 User mirroring — lazy-on-first-authenticated-request

Supabase Auth stores the user in `auth.users`. We mirror them into our
`public.users` table on first authenticated request, NOT in the
`/api/v1/auth/callback` route. Why lazy:

- Callback route stays simple (just verifies the token, sets cookie).
- If the mirror write fails, the user can still log in — they just hit
  the lazy path on the next request and we retry.
- Avoids race conditions with the post-login redirect.

Mirror happens inside `getCtx()`: if `getCtx` is called and `users` has
no row for `auth.uid()`, insert one (idempotent via unique constraint
on `_id`). The mirrored row is minimal: `_id`, `email`, `name` (from
Supabase user metadata if present), `createdAt`.

### 4.3 `ctx` pattern — server-side, not header-derived

`ctx: { userId, tenantId, role }` is computed server-side from the
Supabase Auth session. It is NEVER read from a request header or body —
those are attacker-controlled. Three layers (per engineering plan §7):

1. **StrictDB schema layer**: every collection except `tenants` and
   `users` declares `tenantId: z.string().uuid()` as required. Inserts
   without it fail at the Zod boundary.
2. **Handler signature**: every handler in
   `packages/shared/src/handlers/**` (none yet — they arrive in
   subsequent specs) accepts `ctx` as a parameter.
3. **Repo helpers**: `packages/shared/src/db/repo.ts` exports typed
   wrappers `repo.queryOne(coll, filter, ctx)` that auto-merge
   `{ tenantId: ctx.tenantId }`. Direct `db.queryOne` from handlers
   becomes a code-review violation (and a future RuleCatch rule).

Spec 003 ships layer 1 (schema) + layer 3 (repo helpers). Handlers
land per-feature, but each one will use `ctx`.

### 4.4 Middleware tenant gate

Spec 002's middleware redirects unauthenticated users to `/login`. Spec
003 adds a second check: **authenticated users without a tenant must go
to `/onboarding`**, and **authenticated users with a tenant who visit
`/onboarding` are bounced to `/app/dashboard`**.

Where the check lives:
- **NOT in `apps/web/middleware.ts`** — Next.js middleware runs on the
  edge by default. Querying Postgres from the edge is slow and the
  Supabase pooler isn't optimised for it. We'd be doing a DB query on
  every request.
- **Instead: `apps/web/app/(app)/layout.tsx`** — a Server Component that
  wraps `/app/*` and `/onboarding`. It calls `getCtx()`, decides redirect
  or pass-through. Server Components can hit Postgres natively, and the
  layout caches per-request via React's Suspense / data-cache.

This is the canonical Next.js App Router pattern for "auth + tenancy
checks before rendering."

### 4.5 No Postgres RLS in v1

Re-stating the engineering-plan decision: we use the three application-
layer guards (schema / handler / repo). Adding RLS later requires
backfilling policies but doesn't break the data model. The cost of RLS
in v1 (debugging, policy authorship, edge cases like webhooks needing
elevated access) outweighs the marginal security benefit given our
chokepoint is StrictDB.

---

## 5. File layout (new files this spec creates)

```
scripts/
├── db-migrate.ts                       # NEW — migration runner
├── migrations/
│   ├── 001-tenants-users-tenantusers.sql   # NEW — first migration
│   └── README.md                       # NEW — how to add a migration
└── queries/                            # cc-mastery query master (already exists)

packages/shared/src/
├── db/
│   ├── schema.ts                       # NEW — registerCollection() for tenants, users, tenantUsers
│   ├── repo.ts                         # NEW — tenant-scoped query wrappers
│   └── client.ts                       # MODIFIED — call ensureIndexes() in getDb()
├── handlers/
│   └── tenants/
│       ├── createTenant.ts             # NEW — used by POST /api/v1/tenants
│       └── createTenant.test.ts        # NEW — unit test
├── auth/
│   ├── ctx.ts                          # NEW — getCtx() + Ctx type
│   └── ctx.test.ts                     # NEW — unit tests (mocked supabase)
└── types/
    └── tenant.ts                       # NEW — Tenant / User / TenantUser TS types

apps/web/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx                  # NEW — tenant-gate Server Component
│   │   ├── app/page.tsx                # MODIFIED — now redirects to /app/dashboard if tenant exists
│   │   ├── app/dashboard/page.tsx      # NEW — placeholder dashboard for spec 003
│   │   └── onboarding/page.tsx         # MODIFIED — adds the workspace-name form
│   └── api/v1/tenants/
│       └── route.ts                    # NEW — POST creates tenant
├── components/onboarding/
│   ├── workspace-form.tsx              # NEW — client component
│   └── workspace-form.test.tsx         # (unit test)
└── app/api/v1/health/route.ts          # MODIFIED — upgraded DB check (db.count('tenants'))

tests/
├── integration/
│   ├── repo.test.ts                    # NEW — cross-tenant leakage prevention tests
│   ├── ctx.test.ts                     # NEW — mirror-on-first-call test
│   └── migrations.test.ts              # NEW — db:migrate idempotency
└── e2e/
    ├── onboarding.spec.ts              # NEW — signup → onboarding form → dashboard
    ├── tenant-isolation.spec.ts        # NEW — Tenant A cannot see Tenant B
    └── _fixtures/
        ├── auth.ts                     # MODIFIED — adds createTestUserWithTenant
        └── tenants.ts                  # NEW — fixture helpers
```

**Modified files:** `packages/shared/src/db/client.ts` (calls
`ensureIndexes` after schema registration), `apps/web/app/api/v1/health/route.ts`
(upgraded to real query), `apps/web/app/(app)/onboarding/page.tsx`
(form replaces placeholder), `apps/web/app/(app)/app/page.tsx`
(redirects based on tenant existence).

---

## 6. Schema design

### 6.1 First migration — `scripts/migrations/001-tenants-users-tenantusers.sql`

```sql
-- Spec 003. Three tables with FK constraints. snake_case in SQL,
-- camelCase in StrictDB schema (the adapter handles the mapping).

CREATE TABLE IF NOT EXISTS public.tenants (
  _id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  plan           TEXT NOT NULL DEFAULT 'free'
                   CHECK (plan IN ('free', 'starter', 'growth', 'agency')),
  dpdp_consent_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.users (
  -- _id mirrors auth.users.id for direct correspondence.
  _id           UUID PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_users (
  _id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(_id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  invited_at    TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
```

Conventions:
- `_id` is the canonical primary-key column name (matches StrictDB / our
  query helpers' MongoDB-derived idiom).
- `snake_case` for SQL columns; the StrictDB adapter maps to/from
  `camelCase` for app code.
- Every multi-tenant table will reference `tenants(_id)` with
  `ON DELETE CASCADE`. Tenants don't actually delete in v1 (we soft-
  delete via `deleted_at`), but the FK behaviour is still correct.

### 6.2 StrictDB schema registration — `packages/shared/src/db/schema.ts`

```ts
import { z } from 'zod';
import type { StrictDB } from 'strictdb';

export const TenantSchema = z.object({
  _id: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,64}$/),
  plan: z.enum(['free', 'starter', 'growth', 'agency']),
  dpdpConsentAt: z.date().nullable().optional(),
  createdAt: z.date(),
  deletedAt: z.date().nullable().optional(),
});

export const UserSchema = z.object({
  _id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  createdAt: z.date(),
});

export const TenantUserSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member']),
  invitedAt: z.date().nullable().optional(),
  acceptedAt: z.date(),
});

export async function registerSchemas(db: StrictDB): Promise<void> {
  db.registerCollection({
    name: 'tenants',
    schema: TenantSchema,
    indexes: [{ collection: 'tenants', fields: { slug: 1 }, unique: true }],
  });
  db.registerCollection({
    name: 'users',
    schema: UserSchema,
    indexes: [{ collection: 'users', fields: { email: 1 }, unique: true }],
  });
  db.registerCollection({
    name: 'tenantUsers',
    schema: TenantUserSchema,
    indexes: [
      { collection: 'tenantUsers', fields: { tenantId: 1, userId: 1 }, unique: true },
      { collection: 'tenantUsers', fields: { userId: 1 } },
    ],
  });
}
```

`getDb()` calls `registerSchemas(db); await db.ensureIndexes()` after
`StrictDB.create()`.

### 6.3 Slug generation

Algorithm in `createTenant.ts`:
1. Lowercase the name.
2. Replace runs of non-`[a-z0-9]` with `-`.
3. Collapse repeated `-`.
4. Trim leading/trailing `-`.
5. Truncate to 56 chars.
6. Append `-` + 6 hex chars from `crypto.randomBytes(3).toString('hex')`.

Example: `"Parvinder's Workshop!"` → `"parvinder-s-workshop-a3f9c2"`. The
random suffix guarantees uniqueness; we don't retry on collision (probability
~10⁻⁸).

---

## 7. Migrations system — `scripts/db-migrate.ts`

```ts
// pseudocode
const MIG_DIR = path.join(__dirname, 'migrations');
const env = loadEnv();
const client = new pg.Client({ connectionString: env.STRICTDB_URI });
// EXCEPTION to "no native pg imports" rule: the migration runner is the
// ONE place we use pg directly because StrictDB doesn't expose DDL.
// Documented in CLAUDE.md "Lessons learned" after this spec lands.

await client.connect();
await ensureMigrationsTable(client);                       // CREATE TABLE _migrations
const applied = await listApplied(client);                 // [{ version, checksum, appliedAt }]
const onDisk = readMigrationsDir().sort();                 // ['001-...', '002-...', ...]

for (const file of onDisk) {
  const version = file.split('-')[0];
  const checksum = sha256(readFileSync(path.join(MIG_DIR, file)));
  const prev = applied.find((a) => a.version === version);
  if (prev !== undefined) {
    if (prev.checksum !== checksum) {
      throw new Error(`Migration ${version} content changed since apply`);
    }
    continue;
  }
  await client.query('BEGIN');
  try {
    await client.query(readFileSync(path.join(MIG_DIR, file), 'utf8'));
    await client.query(
      'INSERT INTO _migrations (version, checksum, applied_at) VALUES ($1, $2, now())',
      [version, checksum],
    );
    await client.query('COMMIT');
    console.log(`✓ applied ${file}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
await client.end();
```

The `_migrations` table:
```sql
CREATE TABLE IF NOT EXISTS public._migrations (
  version    TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL
);
```

Run via:
```bash
pnpm db:migrate          # apply pending
pnpm db:migrate --check  # exit 1 if pending migrations exist (CI gate)
```

`scripts/migrations/README.md` documents:
- File-naming: `NNN-short-description.sql` (zero-padded NNN)
- Never edit a migration after it's been applied to production
- For schema rollbacks, write a new migration (forward-only)
- Add to `.claude/hooks/check-mdd-version.sh` is NOT relevant — these
  files don't have an mdd_version frontmatter

---

## 8. Onboarding flow

### 8.1 The form — `components/onboarding/workspace-form.tsx`

Single text input "Workspace name." Submits to
`POST /api/v1/tenants` with `{ name }`. On success → `window.location.href = '/app/dashboard'`.

Validation (client + server, Zod):
- 1–120 chars, trim whitespace
- Not just whitespace

### 8.2 Endpoint — `apps/web/app/api/v1/tenants/route.ts`

`POST /api/v1/tenants`:
1. Verify Supabase session via `getCtx()` — but `getCtx` returns a
   "userId-only" shape if the user has no tenant yet. Pre-tenant ctx.
2. Parse body with Zod (`{ name: z.string().min(1).max(120) }`).
3. If user already has a tenant (i.e., `tenantUsers` row exists), 409
   with `error: 'tenant_exists'`. Onboarding is one-shot.
4. Generate slug per §6.3.
5. `db.batch([insertTenant, insertUser-if-not-mirrored, insertTenantUser])`
   in a single batch operation (atomic per StrictDB semantics).
6. Return `{ tenant: { _id, slug, name } }` with 201.

`GET /api/v1/tenants/me`: returns the current user's tenant (null if
none). Used by /onboarding to detect "already onboarded → redirect."
Returns `{ tenant, role } | { tenant: null }`.

### 8.3 Layout gate — `app/(app)/layout.tsx`

```tsx
// pseudocode
export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getCtx();        // null if no session — middleware caught
  if (ctx === null) redirect('/login'); // belt + braces

  const path = (await headers()).get('x-pathname') ?? '/app';
  const hasTenant = ctx.tenantId !== null;

  if (!hasTenant && path !== '/onboarding') redirect('/onboarding');
  if (hasTenant && path === '/onboarding') redirect('/app/dashboard');

  return <>{children}</>;
}
```

The `x-pathname` header is set by middleware (one-line addition):
```ts
response.headers.set('x-pathname', request.nextUrl.pathname);
```

This avoids parsing the URL twice; the layout reads what middleware
already computed.

### 8.4 Updated middleware

`apps/web/middleware.ts` adds:
- Set `x-pathname` on the outgoing response so layouts can read it.
- The "redirect to onboarding" logic stays in the layout — middleware
  doesn't query Postgres.

---

## 9. `getCtx()` + repo helpers

### 9.1 `packages/shared/src/auth/ctx.ts`

```ts
export interface Ctx {
  userId: string;
  tenantId: string | null;     // null while user is in onboarding
  role: 'owner' | 'admin' | 'member' | null;
  email: string;
}

export async function getCtx(): Promise<Ctx | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user === null) return null;

  const db = await getDb();

  // Mirror Supabase Auth user → public.users (lazy, idempotent)
  await db.updateOne(
    'users',
    { _id: user.id },
    {
      $setOnInsert: {
        _id: user.id,
        email: user.email ?? '',
        name: user.user_metadata?.name ?? null,
        createdAt: new Date(),
      },
    },
    true, // upsert
  );

  // Find the user's tenant
  const tu = await db.queryOne<{ tenantId: string; role: 'owner' | 'admin' | 'member' }>(
    'tenantUsers',
    { userId: user.id },
  );

  return {
    userId: user.id,
    tenantId: tu?.tenantId ?? null,
    role: tu?.role ?? null,
    email: user.email ?? '',
  };
}
```

### 9.2 `packages/shared/src/db/repo.ts`

```ts
export const repo = {
  async queryOne<T>(coll: string, filter: Record<string, unknown>, ctx: Ctx) {
    requireTenant(ctx);
    return db.queryOne<T>(coll, { ...filter, tenantId: ctx.tenantId });
  },
  async queryMany<T>(coll: string, filter: Record<string, unknown>, ctx: Ctx, opts?: ...) {
    requireTenant(ctx);
    return db.queryMany<T>(coll, { ...filter, tenantId: ctx.tenantId }, opts);
  },
  async insertOne<T>(coll: string, doc: Record<string, unknown>, ctx: Ctx) {
    requireTenant(ctx);
    return db.insertOne(coll, { ...doc, tenantId: ctx.tenantId });
  },
  // ... updateOne, deleteOne, count — same pattern
};

function requireTenant(ctx: Ctx): asserts ctx is Ctx & { tenantId: string } {
  if (ctx.tenantId === null) {
    throw new Error('repo: ctx has no tenantId — caller is in onboarding state');
  }
}
```

The `tenants` and `users` collections do NOT go through `repo` — they're
the only two without `tenantId`. Direct `db.queryOne('tenants', ...)`
is the documented exception, used inside `getCtx` and `createTenant`.

### 9.3 Why this is safe

Three layers of defence (per engineering plan §7):
1. **StrictDB schema requires `tenantId`** — insert without it = Zod error.
2. **Handlers receive `ctx`** — never read `tenantId` from request body.
3. **Repo helpers prepend `tenantId`** — even if a handler passes a
   filter that says `{ tenantId: 'attacker-id' }`, the repo overwrites
   it with `ctx.tenantId`.

---

## 10. Acceptance criteria (drives the test phase)

### 10.1 Migration tests (Vitest)
- **M1**: `pnpm db:migrate` on a fresh DB creates `tenants`, `users`,
  `tenant_users`, `_migrations`. Idempotent — second run no-ops.
- **M2**: `pnpm db:migrate --check` exits 0 when all applied, exits 1
  when pending exist.
- **M3**: editing an applied migration's contents (changing checksum)
  causes the runner to fail with a clear error, NOT silently re-apply.

### 10.2 Schema unit tests (Vitest)
- **S1**: `TenantSchema.parse({ ... missing slug ... })` throws.
- **S2**: `TenantSchema.parse({ ... bad slug like "UPPERCASE" ... })` throws.
- **S3**: `TenantUserSchema.parse({ ... role: "x" ... })` throws.
- **S4**: slug-generator produces valid slugs for: empty name, all-symbols,
  unicode (`"वर्कस्पेस"`), trailing whitespace.

### 10.3 Repo helper tests (Vitest, real Supabase)
- **R1**: `repo.queryOne('automations', { _id: 'x' }, ctx)` actually queries
  with `{ _id: 'x', tenantId: ctx.tenantId }` (verified by `db.explain`).
- **R2**: passing a filter that already has `tenantId` — repo overrides
  it with `ctx.tenantId` (no privilege escalation possible).
- **R3**: `requireTenant(ctxWithoutTenant)` throws.
- **R4**: `repo.insertOne` always tags the inserted doc with `ctx.tenantId`.

### 10.4 `getCtx` tests (Vitest, real Supabase)
- **C1**: User with no tenant → `getCtx()` returns
  `{ userId, tenantId: null, role: null, email }` AND mirrors them into
  `users` table.
- **C2**: Mirror is idempotent — calling `getCtx()` twice for the same
  user does not create duplicate `users` rows.
- **C3**: User with tenant → `getCtx()` returns the tenant + role.
- **C4**: No session → `getCtx()` returns `null`.

### 10.5 Cross-tenant leakage (Vitest integration)
- **X1**: Two tenants A and B. A inserts a row into a hypothetical
  test collection. B's `repo.queryMany` returns 0 rows.
- **X2**: B tries to query A's data by passing `{ tenantId: 'A-id' }`
  through `repo` — still returns 0 rows (override works).
- **X3**: B accesses `db.queryMany` directly with `{ tenantId: 'A-id' }` —
  RETURNS A's data. This test confirms the threat model: only `repo`
  is safe; direct `db` calls bypass the chokepoint, which is why we
  enforce "handlers use repo, not db" in code review.

### 10.6 E2E (Playwright)
- **EO1 (onboarding happy)**: signup → email-confirm via admin API →
  log in → `/app` redirects to `/onboarding` → fill workspace name →
  submit → land on `/app/dashboard` with the workspace name visible.
- **EO2 (onboarding skip prevention)**: directly visiting `/app/dashboard`
  pre-onboarding redirects to `/onboarding`.
- **EO3 (re-visit onboarding after onboarded)**: completed user hitting
  `/onboarding` redirects to `/app/dashboard`.
- **ET1 (tenant isolation)**: two test users created with separate
  workspaces. User A's session cannot see User B's tenant via
  `GET /api/v1/tenants/me`.
- **ET2 (one-shot onboarding)**: POSTing to `/api/v1/tenants` twice as
  the same user returns 409 on the second call.

### 10.7 Health endpoint upgrade
- **H1**: `GET /api/v1/health` now returns `checks.db.ok = true` only if
  `db.count('tenants', {})` succeeds (not just client construction). On
  a fresh DB, count is `0` but the call succeeds.

### 10.8 Build + lint + types
- **B1**: `pnpm typecheck` — no errors.
- **B2**: `pnpm build` — no errors.
- **B3**: `pnpm lint` — no errors.
- **B4**: no file > 300 lines, no function > 50 lines.

---

## 11. Risks & open questions

1. **`pg` direct import in migration runner.** This violates the
   "StrictDB only" rule. Mitigation: it's confined to `scripts/db-migrate.ts`,
   the file documents the exception, and the codebase has zero other
   `pg` imports. Add to CLAUDE.md "Lessons learned" once shipped.

2. **Slug collision (probability ~10⁻⁸).** If it happens, `INSERT` fails
   on the unique constraint. We don't retry — the user sees a generic
   "couldn't create workspace, please try again" toast. Acceptable for
   v1; spec 003.5 can add retry-on-collision.

3. **Test users left in dev Supabase project.** E2E and integration tests
   create real users + tenants. Cleanup hooks delete what they create,
   but a crashed test leaks a row. Periodic cleanup via
   `scripts/queries/cleanup-test-tenants.ts` (added in this spec) removes
   any tenant whose slug matches `^test-` and is older than 1 hour.

4. **Mirror race on parallel requests.** If two requests for a brand-new
   user race, both might attempt to insert the user row. The unique
   constraint on `users._id` makes the second insert fail; the upsert
   in `getCtx` handles this gracefully (`$setOnInsert` is idempotent).
   Verified in C2.

5. **`repo` doesn't cover all StrictDB operations.** v1 ships
   `queryOne`, `queryMany`, `insertOne`, `updateOne`, `deleteOne`,
   `count`. `queryWithLookup` and `batch` are added when first needed
   (likely spec 007).

6. **Performance: `getCtx` runs on every authenticated request.** That's
   2 DB queries (mirror upsert + tenantUsers lookup). Once we have
   per-request caching, we'll memoise it. For private beta with ~500
   tenants this is fine — Supabase Postgres pooler handles thousands
   of QPS.

7. **No tenant-deletion path.** Deleting a Supabase Auth user via the
   admin API does NOT cascade to `users` / `tenantUsers`. Spec 013
   (privacy) wires the cascade via the public.users FK and the tenant
   soft-delete. For now, manually deleting test data via
   `pnpm db:query cleanup-test-tenants`.

---

## 12. Definition of done

- [ ] All files in §5 exist on `feat/spec-003-tenants-users`.
- [ ] `pnpm db:migrate` applied to your dev Supabase project.
- [ ] All §10 acceptance tests pass.
- [ ] `git diff master...HEAD` reviewed by user.
- [ ] `code-reviewer` subagent run + findings addressed.
- [ ] Branch fast-forward merged into `master`.
- [ ] Commit message: `feat(tenants): tenants/users/tenantUsers schemas,
      ctx, repo helpers, onboarding flow`.

---

## 13. After approval

Compressed loop: I roll tests → code → review → fixes → present for
merge approval. One stop-gate (you say "approved" → merge).

Then move to spec 004 (Meta OAuth) on a new branch.

---

**END OF SPEC — awaiting approval.**
