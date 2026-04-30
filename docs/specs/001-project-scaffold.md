# Spec 001 — Project Scaffold

> **MDD phase:** Document. Awaiting approval before tests are written.
> **Implements:** §Appendix B item 1 of `docs/engineering-plan.md`.

**Status:** Draft, awaiting approval
**Branch:** `feat/spec-001-scaffold`
**Last updated:** 2026-04-30

---

## 1. Goal

Stand up the empty skeleton of AutomateBro so every subsequent spec has
something to plug into. After this spec ships, the repo should:

- Build and type-check end-to-end with `pnpm build` and `pnpm typecheck`.
- Run a Next.js dev server on port 3000 (and 3001 / 3002 mirrors) via
  `pnpm dev` / `pnpm dev:website` / `pnpm dev:api` / `pnpm dev:dashboard`.
- Run a worker process via `pnpm dev:worker` (and `pnpm start:worker` for
  production).
- Connect to a real Supabase Postgres and Upstash Redis on startup.
- Expose `GET /api/v1/health` returning `{ status, db, redis }` proving the
  wiring is real.
- Validate env vars at startup with Zod — missing or malformed env crashes
  the process with a clear message, not a runtime null-deref later.
- Shut down both processes cleanly on `SIGINT` / `SIGTERM` (StrictDB
  closed, Redis disconnected).

**Nothing else.** No auth, no OAuth, no webhooks, no automations, no
billing, no AI. Each of those is its own spec.

---

## 2. Out of scope (explicit)

These are deferred to later specs and **must not** be implemented in 001
even if it would be one extra line:

- Supabase Auth integration → spec 002
- `tenants` / `users` collection schemas → spec 003
- Meta OAuth → spec 004
- `/api/v1/webhooks/meta` → spec 005
- BullMQ consumer logic → spec 006
- Any UI beyond a "hello" page on `/`
- Sentry / Axiom / PostHog wiring → spec 014
- Razorpay / Resend / OpenAI adapters → specs 010 / 008 / 008
- Vercel deployment configuration → done after 001 lands, not as part of it
- Railway worker deployment → same, post-001

The point of strict scope: spec 001 must merge to `master` cleanly with
no half-built dependencies that block other work.

---

## 3. Prerequisites — accounts to create

The user will need these credentials before the implementation phase. The
spec assumes nothing is set up yet.

### 3.1 Supabase project (fresh)
1. Sign up at https://supabase.com (free tier).
2. **Create new project**:
   - **Name:** `automatebro-prod` (we'll create `automatebro-staging` later)
   - **Region:** **South Asia (Mumbai) — `ap-south-1`** ← critical for
     DPDP residency.
   - **Database password:** generate a strong one, store in 1Password
     (you'll need it for the `STRICTDB_URI`).
3. Once provisioned (~2 min), grab three values from the dashboard:
   - **Project Settings → Database → Connection string → URI mode →
     "Connection pooling" tab → "Transaction" pool**. Copy the
     `postgresql://...` string. This becomes `STRICTDB_URI`.
   - **Project Settings → API → Project URL.** Becomes `SUPABASE_URL`
     (saved for spec 002, included in `.env.example` as a placeholder).
   - **Project Settings → API → anon (public) key.** Becomes
     `SUPABASE_ANON_KEY` (placeholder for spec 002).
   - **Project Settings → API → service_role key.** Becomes
     `SUPABASE_SERVICE_ROLE_KEY` (placeholder for spec 002, **never
     exposed to the browser**).
4. **No migrations are run in spec 001.** StrictDB connects to the empty
   database and that's enough to prove the wiring.

### 3.2 Upstash Redis (fresh)
1. Sign up at https://upstash.com (free tier).
2. **Create Redis database:**
   - **Name:** `automatebro-prod`
   - **Region:** **Mumbai (`ap-south-1`)** — same region as Supabase to
     minimise latency.
   - **Eviction:** disabled (we want BullMQ jobs persisted).
   - **TLS:** on.
3. Copy the **Redis Connect → `redis-cli` URL**. It looks like
   `rediss://default:<password>@<host>.upstash.io:6379`. This becomes
   `REDIS_URL`.
   - **Not** the REST URL — BullMQ uses the wire protocol, not REST.

### 3.3 Vercel + Railway — already created (per user)
No action in this spec; deploy hookup is post-001.

### 3.4 Domain — defer
`automatebro.com` will be registered later. Spec 001 uses
`http://localhost:3000` and Vercel preview URLs.

---

## 4. Repository structure (definitive after 001)

```
automatebro/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                       # "Hello, AutomateBro" placeholder
│   │   │   └── api/v1/health/route.ts         # the health check
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── package.json
│   │   └── biome.json                          # extends root
│   └── worker/
│       ├── src/
│       │   └── index.ts                        # bootstrap + graceful shutdown
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── db/
│       │   │   └── client.ts                   # StrictDB singleton
│       │   ├── queue/
│       │   │   └── queues.ts                   # BullMQ Queue + connection
│       │   ├── env.ts                          # Zod env validator
│       │   ├── logger.ts                       # Pino instance
│       │   └── index.ts                        # barrel
│       ├── tsconfig.json
│       └── package.json
├── scripts/
│   └── db-query.ts                             # cc-mastery query master (empty registry)
├── tests/
│   ├── unit/.gitkeep
│   ├── integration/.gitkeep
│   └── e2e/
│       └── health.spec.ts                      # E2E: GET /api/v1/health
├── docs/
│   ├── engineering-plan.md
│   └── specs/
│       └── 001-project-scaffold.md             # this file
├── project-docs/                                # already present (cc-mastery)
├── .claude/                                     # already present (cc-mastery)
├── .env.example                                 # rewritten in this spec
├── .env                                         # gitignored, user-created
├── .gitignore                                   # already present
├── .dockerignore                                # already present
├── biome.json                                   # root lint + format config
├── playwright.config.ts                         # E2E config (test ports 4000/4010/4020)
├── vitest.config.ts                             # unit/integration config
├── pnpm-workspace.yaml                          # workspaces
├── package.json                                 # root scripts
├── tsconfig.base.json                           # shared compiler config
├── tsconfig.json                                # references the base
├── CLAUDE.md                                    # already present
└── README.md                                    # rewritten in this spec
```

**Files that already exist (cc-mastery starter kit) and stay untouched
unless noted:**
- `.gitignore`, `.dockerignore`, `.claude/**`, `claude-mastery-project.conf`
- `CLAUDE.md` (the project-instructions file)
- `project-docs/` (architecture / infrastructure / decisions docs)

**Files that exist but get rewritten:** `.env.example` (cc-mastery default
has Rybbit / Dokploy / RuleCatch entries we don't need; trim and replace
with our actual env-var set).

---

## 5. Workspace configuration

### 5.1 `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 5.2 Root `package.json` — scripts (CLAUDE.md quick-reference parity)
```json
{
  "name": "automatebro",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9.x",
  "engines": { "node": ">=20.0.0 <21.0.0" },
  "scripts": {
    "dev": "pnpm --filter @automatebro/web dev",
    "dev:website": "pnpm --filter @automatebro/web dev -- -p 3000",
    "dev:api": "pnpm --filter @automatebro/web dev -- -p 3001",
    "dev:dashboard": "pnpm --filter @automatebro/web dev -- -p 3002",
    "dev:worker": "pnpm --filter @automatebro/worker dev",
    "build": "pnpm -r build",
    "start": "pnpm --filter @automatebro/web start",
    "start:worker": "pnpm --filter @automatebro/worker start",
    "typecheck": "pnpm -r typecheck",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "pnpm test:unit && pnpm test:e2e",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "pnpm test:kill-ports && playwright test",
    "test:e2e:ui": "pnpm test:kill-ports && playwright test --ui",
    "test:e2e:headed": "pnpm test:kill-ports && playwright test --headed",
    "test:e2e:chromium": "pnpm test:kill-ports && playwright test --project=chromium",
    "test:e2e:report": "playwright show-report",
    "test:kill-ports": "node ./scripts/kill-ports.mjs 4000 4010 4020",
    "db:query": "tsx scripts/db-query.ts",
    "db:query:list": "tsx scripts/db-query.ts --list",
    "clean": "rimraf dist coverage test-results playwright-report **/.next **/.turbo"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@playwright/test": "^1.48.0",
    "@types/node": "^20.0.0",
    "rimraf": "^6.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

**Note:** `dev:website` / `dev:api` / `dev:dashboard` all run **the same
Next.js app** on different ports — per the engineering plan §3, we
consolidated to one Next.js deployment. Day-to-day dev uses `pnpm dev`
(default port 3000).

### 5.3 `tsconfig.base.json` (shared)
- `target`: `ES2022`
- `module`: `ESNext`
- `moduleResolution`: `Bundler`
- `strict`: `true`
- `noUncheckedIndexedAccess`: `true`
- `noImplicitOverride`: `true`
- `paths`: `{ "@automatebro/shared/*": ["./packages/shared/src/*"] }`

Each app/package extends this with its own `outDir` and `include` rules.

### 5.4 `biome.json` (root)
- `formatter.indentStyle`: `space`, `indentWidth`: 2
- `linter.rules.recommended`: `true`
- `linter.rules.style.useImportType`: `error`
- `linter.rules.suspicious.noExplicitAny`: `error` (per CLAUDE.md Rule #1)
- `formatter.lineWidth`: 100
- `organizeImports.enabled`: `true`

### 5.5 `apps/web/package.json`
- `name`: `@automatebro/web`
- `dependencies`: `next@^15`, `react@^19`, `react-dom@^19`, `zod@^3`,
  `@automatebro/shared@workspace:*`, `tailwindcss@^3.4`, `postcss`,
  `autoprefixer`
- `devDependencies`: `@types/react`, `@types/react-dom`,
  `tailwindcss-cli` (dev script)
- `scripts.dev`: `next dev`
- `scripts.build`: `next build`
- `scripts.start`: `next start`
- `scripts.typecheck`: `tsc --noEmit`

shadcn/ui is **not** initialized in spec 001 — it gets initialized in
spec 011 (dashboard UI) when we actually need components. Keeping it out
keeps the dep graph small for now.

### 5.6 `apps/worker/package.json`
- `name`: `@automatebro/worker`
- `dependencies`: `bullmq@^5`, `ioredis@^5`,
  `@automatebro/shared@workspace:*`, `pino@^9`
- `devDependencies`: `tsx`
- `scripts.dev`: `tsx watch src/index.ts`
- `scripts.start`: `node --enable-source-maps dist/index.js`
- `scripts.build`: `tsc`
- `scripts.typecheck`: `tsc --noEmit`

### 5.7 `packages/shared/package.json`
- `name`: `@automatebro/shared`
- `main`: `./src/index.ts` (resolved via workspace, not built)
- `dependencies`: `strictdb@^latest`, `pg@^8` (peer of StrictDB),
  `bullmq@^5`, `ioredis@^5`, `zod@^3`, `pino@^9`
- `scripts.typecheck`: `tsc --noEmit`
- `scripts.build`: `echo 'no build — referenced as source'`

**Note on `pg`:** StrictDB requires the native driver to be installed
alongside it; `pg` is the peer dep for the Postgres backend. Per
CLAUDE.md Rule #3, we **never `import` from `pg` directly** — only
StrictDB does, internally.

---

## 6. Env-var hygiene

### 6.1 New `.env.example` (replaces cc-mastery template)
```bash
# AutomateBro — local environment.
# Copy to .env (gitignored) and fill in real values.

# ---- Application ----
NODE_ENV=development
LOG_LEVEL=info
# Default Next.js dev port; CLAUDE.md table maps dev:website/dev:api/dev:dashboard
# to 3000/3001/3002 respectively.
PORT=3000

# ---- Database (Supabase Postgres via StrictDB) ----
# Get from Supabase Dashboard → Project Settings → Database →
# Connection string → URI → Transaction pooler.
STRICTDB_URI=postgresql://postgres.<ref>:<password>@<host>:6543/postgres

# ---- Redis (Upstash) ----
# Get from Upstash Dashboard → Database → Redis Connect → redis-cli.
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379

# ---- Supabase (placeholders for spec 002, not used in spec 001) ----
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

The cc-mastery defaults (`JWT_SECRET`, `GITHUB_USERNAME`, `RYBBIT_*`,
`DOCKER_*`, `DOKPLOY_*`, `VPS_IP`, `RULECATCH_*`) are **removed**. None
of them apply to AutomateBro.

### 6.2 `packages/shared/src/env.ts`
A single Zod schema parsed once at startup. Two consumers (web app,
worker) both import it. Missing or malformed env crashes the process at
boot with a readable error.

```ts
// pseudocode — full implementation in code phase
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STRICTDB_URI: z.string().url(),
  REDIS_URL: z.string().url(),
  // SUPABASE_* declared optional in spec 001 — required from spec 002.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});
export const env = Env.parse(process.env);
```

This file is the **only** place `process.env` is read. Every other file
imports `env` from here. Lint rule will catch direct `process.env` use
in `apps/**` — reject in code review.

### 6.3 Secrets we must never log
- `STRICTDB_URI` (contains DB password)
- `REDIS_URL` (contains Redis password)
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase admin key)

`logger.ts` will redact these via Pino's `redact` option.

---

## 7. StrictDB client

`packages/shared/src/db/client.ts`:

```ts
// pseudocode
import { StrictDB } from 'strictdb';
import { env } from '../env.js';

let dbPromise: Promise<StrictDB> | null = null;

export function getDb(): Promise<StrictDB> {
  if (!dbPromise) {
    dbPromise = StrictDB.create({ uri: env.STRICTDB_URI });
  }
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.gracefulShutdown(0).catch(() => {});
    dbPromise = null;
  }
}
```

**No collections registered in spec 001.** `getDb()` returns a usable
client that any subsequent spec can extend. Reading the engineering plan
§5, the first collection registration (`tenants`) lands in spec 003.

---

## 8. BullMQ queue setup

`packages/shared/src/queue/queues.ts`:

```ts
// pseudocode
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env.js';

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const eventsQueue = new Queue('events', { connection });

export async function closeQueue(): Promise<void> {
  await eventsQueue.close();
  await connection.quit();
}
```

**No BullMQ Worker (consumer) in spec 001.** That's spec 006. We export
the `Queue` so it's importable, and the worker process keeps the Redis
connection open as a heartbeat — but it does not pull jobs.

---

## 9. Health-check endpoint contract

`apps/web/app/api/v1/health/route.ts` — `GET` only, no auth:

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "checks": {
    "db": { "ok": true, "backend": "postgresql" },
    "redis": { "ok": true, "latencyMs": 12 }
  }
}
```

**Response (503 Service Unavailable):** when any check fails.
```json
{
  "status": "degraded",
  "version": "0.1.0",
  "checks": {
    "db": { "ok": false, "error": "<message>" },
    "redis": { "ok": true, "latencyMs": 12 }
  }
}
```

**What "ok" means in spec 001 (intentionally shallow):**
- **db.ok**: `getDb()` resolved without throwing. We do **not** execute
  a query because we have no collections registered yet. Spec 003
  upgrades this to a real `db.count('tenants', {})` round-trip.
- **redis.ok**: `connection.ping()` returned `PONG` within 1 second.

The endpoint runs in **Node runtime**, not Edge — StrictDB and ioredis
both need Node APIs.

**Caching:** `Cache-Control: no-store`. Health is real-time.

---

## 10. Worker bootstrap contract

`apps/worker/src/index.ts`:

**On start:**
1. Parse env via Zod (crashes on invalid).
2. Instantiate logger.
3. Call `getDb()` (warms connection).
4. Connect to Redis via the `connection` exported from
   `packages/shared/src/queue/queues.ts`.
5. Set up heartbeat: every 30 s, write `worker:heartbeat` key in Redis
   with current timestamp + 90 s TTL. (Better Stack reads this in
   production; for spec 001 it's just demonstrated wiring.)
6. Log `{ msg: 'worker ready', pid }` once.

**On `SIGINT` / `SIGTERM`:**
1. Stop heartbeat interval.
2. `await closeQueue()` (queue + Redis connection).
3. `await closeDb()` (StrictDB).
4. Log `{ msg: 'worker shutdown complete' }`.
5. `process.exit(0)`.

**On `uncaughtException` / `unhandledRejection`:**
- Log error.
- Run the same shutdown sequence with exit code 1.
- Per CLAUDE.md StrictDB rules: never `process.exit()` without closing
  connections.

---

## 11. Acceptance criteria (drives the test phase)

When this spec ships, all of the following must pass. Each is a
distinct test that will be written in the **Test phase** (after this
spec is approved).

### 11.1 Unit tests (Vitest, no infra)
- **U1 — env validation:** `Env.parse({})` throws with a message
  mentioning `STRICTDB_URI`.
- **U2 — env defaults:** `Env.parse({ STRICTDB_URI: '...', REDIS_URL:
  '...' })` returns `NODE_ENV='development'` and `LOG_LEVEL='info'`.
- **U3 — env rejects malformed URL:** `STRICTDB_URI: 'not-a-url'` throws.
- **U4 — logger redaction:** logging a message that contains
  `STRICTDB_URI`'s value emits the literal string `[REDACTED]` in place
  of the secret.

### 11.2 Integration tests (Vitest, real local infra via Docker compose
or live Supabase / Upstash test instance)
- **I1 — `getDb()` resolves:** returns a StrictDB instance whose
  `.backend` property equals `'postgresql'`.
- **I2 — `getDb()` is a singleton:** calling twice returns the same
  underlying connection (referential equality of the resolved value).
- **I3 — `eventsQueue` exists:** `eventsQueue.name === 'events'` and
  `await connection.ping() === 'PONG'`.
- **I4 — `closeDb()` is idempotent:** call twice without throwing.

### 11.3 E2E test (Playwright, runs against `pnpm dev` on test port 4000)
- **E1 — health endpoint succeeds when infra up:**
  - `GET /api/v1/health` returns 200.
  - JSON body has `status === 'ok'`.
  - `checks.db.ok === true`.
  - `checks.redis.ok === true`.
  - `Cache-Control` header equals `no-store`.
  - Per CLAUDE.md Rule #4, this satisfies the **3-assertion minimum**:
    URL (`/api/v1/health`), visible field (`status`), data (`ok`).

### 11.4 Worker behaviour (Vitest with child_process)
- **W1 — worker starts and idles:** spawn `pnpm dev:worker` as child
  process; assert it logs `worker ready` within 5 s; SIGINT it; assert
  it logs `worker shutdown complete` and exits 0 within 5 s.
- **W2 — worker rejects bad env:** spawn worker with `STRICTDB_URI=`
  empty; assert it exits non-zero within 2 s with an error message
  mentioning `STRICTDB_URI`.
- **W3 — worker writes heartbeat:** after `worker ready`, read
  `worker:heartbeat` key from Redis; assert it's a recent ISO timestamp.

### 11.5 Build & type check
- **B1 — `pnpm typecheck` exits 0** with no errors across all packages.
- **B2 — `pnpm build` exits 0** producing `apps/web/.next/` and
  `apps/worker/dist/`.
- **B3 — `pnpm lint` exits 0** with zero Biome violations.

### 11.6 Hooks compatibility
- **H1 — cc-mastery `check-branch.sh` pre-commit hook is wired:**
  attempting `git commit` on `master` with staged changes is blocked.
- **H2 — `block-secrets.py` does not flag false positives** on the
  files this spec creates.

---

## 12. Risks & open questions

1. **Supabase Transaction pooler vs. Session pooler.** StrictDB-on-Postgres
   uses the standard `pg` driver; Supabase's "Transaction" pooler limits
   prepared statements, "Session" pooler doesn't. The choice depends on
   StrictDB's internals. **Decision:** start with Transaction pooler (the
   modern default; supports more concurrent connections). If StrictDB
   complains during the integration test, switch to Session pooler. Note
   it as a lesson-learned in CLAUDE.md.
2. **Upstash free tier 10K commands/day.** A single dev day with hot
   reload could blow past this. **Mitigation:** during local dev, use a
   local Redis container instead. Add `docker-compose.yml` for local
   Postgres + Redis as a follow-up spec; for spec 001 we point at
   Upstash and accept the risk.
3. **Node 20 vs. Node 22.** Vercel and Railway both support 20 LTS as
   default; 22 is current. **Decision:** Node 20 LTS — Vercel's stated
   default, less likely to surface library incompatibilities.
4. **Tailwind v3 vs. v4.** v4 just shipped with a new config style.
   shadcn's stable docs target v3. **Decision:** Tailwind **v3** for
   spec 001; revisit for v4 migration in 2026 H2.
5. **Biome vs. ESLint + Prettier.** **Decision: Biome.** Single tool,
   ~10× faster, no plugin sprawl. cc-mastery's `lint-on-save.sh` hook
   shells out to a generic `pnpm lint`; Biome plugs in cleanly.
6. **Path-alias resolution at build time.** Next.js + tsx + Biome each
   need to know `@automatebro/shared` resolves to source. We declare it
   in `tsconfig.base.json` and `next.config.ts`'s `transpilePackages`.
   Biome reads tsconfig paths natively. Risk: tsx might miss it. If so,
   add `tsconfig-paths` registration.
7. **Health check is shallow in 001.** We can't query a real table
   because no schemas exist yet. Spec 003 upgrades this. **Risk:** a
   broken table layer wouldn't be caught until 003. Acceptable —
   nothing depends on table operations until 003.
8. **No CI in spec 001.** GitHub Actions will be added in spec 014
   (observability) along with the deploy hooks. For 001 we run tests
   manually before merge.

---

## 13. Definition of done

This spec is "done" when:

- [ ] All files in §4 exist on `feat/spec-001-scaffold`.
- [ ] `.env.example` rewritten per §6.1.
- [ ] User has filled in `.env` with real Supabase + Upstash creds.
- [ ] `pnpm install` completes with zero peer-dep warnings.
- [ ] All §11 acceptance tests pass.
- [ ] `git diff master...HEAD` reviewed by the user.
- [ ] Branch merged fast-forward into `master`.
- [ ] Commit message: `feat(scaffold): bootstrap workspaces, StrictDB,
      BullMQ queue, health endpoint`.

---

## 14. After approval

Next phases of the MDD loop for spec 001:

1. **Test phase** — write all §11 tests as failing tests on this branch.
   Stop for approval.
2. **Code phase** — implement just enough to make §11 tests pass. Stop
   for approval.
3. **Review subagent** — run `code-reviewer` against the diff. Stop for
   approval.
4. **Commit** — squash-merge the branch.

Then move to spec 002 (`002-supabase-auth.md`) on a new feature branch.

---

**END OF SPEC — awaiting approval. Do not begin §11 tests until this
doc is accepted.**
