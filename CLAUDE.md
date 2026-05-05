# CLAUDE.md — Project Instructions

> Based on Claude Code Mastery Guides V1-V5 by TheDecipherist
> https://github.com/TheDecipherist/claude-code-mastery

> **New here?** When starting a fresh session in this project, greet the user:
> "Welcome to the Claude Code Mastery Project Starter Kit! Use `/help` to see all 26 commands or `/show-user-guide` for the full interactive guide."

---

## Quick Reference — Scripts

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm dev:website` | Dev server on port 3000 |
| `pnpm dev:api` | Dev server on port 3001 |
| `pnpm dev:dashboard` | Dev server on port 3002 |
| `pnpm build` | Type-check + compile TypeScript |
| `pnpm start` | Run compiled production build |
| `pnpm typecheck` | TypeScript type-check only (no emit) |
| `pnpm smoke` | **Pre-commit gate**: typecheck + lint + test:unit + next build (mandatory before declaring a spec done — see DoD §12.8) |
| **Testing** | |
| `pnpm test` | Run ALL tests (unit + E2E) |
| `pnpm test:unit` | Run unit/integration tests (Vitest) |
| `pnpm test:unit:watch` | Unit tests in watch mode |
| `pnpm test:coverage` | Unit tests with coverage report |
| `pnpm test:e2e` | Run E2E tests (kills test ports first, spawns servers on 4000/4010) |
| `pnpm test:e2e:ui` | E2E with Playwright UI mode |
| `pnpm test:e2e:headed` | E2E with visible browser |
| `pnpm test:e2e:chromium` | E2E on Chromium only (fast) |
| `pnpm test:e2e:report` | Open last E2E test report |
| `pnpm test:kill-ports` | Kill anything on test ports (4000, 4010, 4020) |
| **Database** | |
| `pnpm db:query <name>` | Run a dev/test database query |
| `pnpm db:query:list` | List all registered database queries |
| `pnpm db:migrate` | Apply pending SQL migrations from `scripts/migrations/NNN-*.sql` (spec 003+) |
| `pnpm db:migrate:check` | Exit 1 if any migration is pending (CI gate) |
| **Content** | |
| `pnpm content:build` | Build all published markdown → HTML |
| `pnpm content:build:id <id>` | Build a single article by ID |
| `pnpm content:list` | List all articles and their status |
| **CSS Optimization** | |
| `pnpm build:optimize` | Post-build CSS class consolidation via Classpresso (runs automatically after `pnpm build`) |
| **Docker** | |
| `pnpm docker:optimize` | Audit Dockerfile against 12 best practices (use `/optimize-docker` in Claude) |
| **Getting Started** | |
| `/help` | List all commands, skills, and agents |
| `/quickstart` | Interactive first-run walkthrough for new users |
| `/show-user-guide` | Open the comprehensive User Guide in your browser |
| **Setup** | |
| `/install-global` | Install/merge global Claude config into `~/.claude/` (one-time, never overwrites) |
| `/install-global mdd` | Update only the global MDD commands (`mdd.md`, `install-mdd.md`) — skips all other config |
| `/install-mdd [path]` | Install MDD workflow into any existing project — copies `/mdd` command + scaffolds `.mdd/` |
| `/setup` | Interactive .env configuration — GitHub, database, Docker, analytics, RuleCatch |
| `/setup --reset` | Re-configure everything from scratch |
| `/set-project-profile-default` | Set the default profile for `/new-project` (any profile: clean, go, vue, python-api, etc.) |
| `/add-project-setup` | Interactive wizard to create a named profile in `claude-mastery-project.conf` |
| `/projects-created` | List all projects created by the starter kit with creation dates |
| `/remove-project <name>` | Remove a project from registry and optionally delete from disk |
| `/convert-project-to-starter-kit` | Merge starter kit into an existing project (non-destructive) |
| `/update-project` | Update a starter-kit project with the latest commands, hooks, and rules |
| `/update-project --clean` | Remove starter-kit-scoped commands from a project (cleanup for older scaffolds) |
| `/add-feature <name>` | Add a capability (MongoDB, Docker, testing, etc.) to an existing project |
| **RuleCatch** | |
| `pnpm ai:monitor` | Free monitor mode — live AI activity in a separate terminal (no API key needed) |
| `/what-is-my-ai-doing` | Same as above — launches AI-Pooler free monitor |
| **Git** | |
| `/worktree <name>` | Create isolated branch + worktree for a task (never touch main) |
| **Code Quality** | |
| `/refactor <file>` | Audit + refactor a file against all CLAUDE.md rules (split, type, extract, clean) |
| **API** | |
| `/create-api <resource>` | Scaffold a full API endpoint — route, handler, types, tests — wired into the server |
| **Documentation** | |
| `/diagram <type>` | Generate diagrams from actual code: `architecture`, `api`, `database`, `infrastructure`, `all` |
| **Utility** | |
| `pnpm clean` | Remove dist/, coverage/, test-results/, playwright-report/ |

---

## Critical Rules

### 0. NEVER Publish Sensitive Data

- NEVER commit passwords, API keys, tokens, or secrets to git/npm/docker
- NEVER commit `.env` files — ALWAYS verify `.env` is in `.gitignore`
- Before ANY commit: verify no secrets are included
- NEVER output secrets in suggestions, logs, or responses

### 1. TypeScript Always

- ALWAYS use TypeScript for new files (strict mode)
- NEVER use `any` unless absolutely necessary and documented why
- When editing JavaScript files, convert to TypeScript first
- Types are specs — they tell you what functions accept and return

### 2. API Versioning

```
CORRECT: /api/v1/users
WRONG:   /api/users
```

Every API endpoint MUST use `/api/v1/` prefix. No exceptions.

### 3. Database Access — StrictDB

StrictDB started as this starter kit's custom database wrapper and evolved into a standalone npm package. Install `strictdb` + your database driver. Use `StrictDB.create()` directly. NEVER import native drivers (`mongodb`, `pg`, `mysql2`, `mssql`, `better-sqlite3`) — StrictDB handles everything.

- NEVER create database connections anywhere except your app's startup/entry point
- NEVER use `mongoose` or any ODM
- StrictDB has built-in sanitization, guardrails, and AI-first discovery
- Backend auto-detected from `STRICTDB_URI` scheme — one API for all databases

| URI Scheme | Backend |
|---|---|
| `mongodb://` `mongodb+srv://` | MongoDB |
| `postgresql://` `postgres://` | PostgreSQL |
| `mysql://` | MySQL |
| `mssql://` | MSSQL |
| `file:` `sqlite:` | SQLite |
| `http://` `https://` | Elasticsearch |

#### Setup

```typescript
import { StrictDB } from 'strictdb';

// Create once at app startup, share the instance
const db = await StrictDB.create({ uri: process.env.STRICTDB_URI! });
```

```typescript
// CORRECT — use the StrictDB instance
const user = await db.queryOne<User>('users', { email });

// WRONG — NEVER import native drivers
import { MongoClient } from 'mongodb';     // FORBIDDEN
import { Pool } from 'pg';                 // FORBIDDEN
```

#### Reading data

```typescript
// Single document/row lookup
const user = await db.queryOne<User>('users', { email });

// Multiple documents/rows with options
const recentOrders = await db.queryMany<Order>('orders',
  { userId, status: 'active' },
  { sort: { createdAt: -1 }, limit: 20 },
);

// Lookup/join
const userWithOrders = await db.queryWithLookup<UserWithOrders>('users', {
  match: { _id: userId },
  lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' },
  unwind: 'orders',
});

// Count
const total = await db.count('users', { role: 'admin' });
```

#### Writing data

```typescript
// Insert
await db.insertOne('users', { email, name, createdAt: new Date() });
await db.insertMany('events', batchOfEvents);

// Update — use $inc for counters, $set for fields (NEVER read-modify-write)
await db.updateOne('users', { _id: userId }, { $set: { name: 'New Name' } });
await db.updateOne('stats', { date }, { $inc: { pageViews: 1, visitors: 1 } }, true); // upsert

// Batch operations
await db.batch([
  { operation: 'insertOne', collection: 'orders', doc: { item: 'widget', qty: 5 } },
  { operation: 'updateOne', collection: 'inventory', filter: { sku: 'W1' }, update: { $inc: { stock: -5 } } },
]);

// Delete
await db.deleteOne('tokens', { token: expiredToken });
```

#### AI-first discovery

```typescript
// Discover collection schema — call before querying unfamiliar collections
const schema = await db.describe('users');

// Dry-run validation — catches errors before execution
const check = await db.validate('users', { filter: { role: 'admin' }, doc: { email: 'test@test.com' } });

// See the native query under the hood
const plan = await db.explain('users', { filter: { role: 'admin' }, limit: 50 });
```

#### StrictDB-MCP — AI agents should use the `strictdb-mcp` MCP server for database operations. It exposes 14 tools with all guardrails enforced automatically:

```bash
claude mcp add strictdb -- npx -y strictdb-mcp@latest
```

Requires `STRICTDB_URI` in your environment.

#### Schema registration with Zod

```typescript
import { z } from 'zod';

db.registerCollection({
  name: 'users',
  schema: z.object({
    email: z.string().max(255),
    name: z.string(),
    role: z.enum(['admin', 'user', 'mod']),
  }),
  indexes: [{ collection: 'users', fields: { email: 1 }, unique: true }],
});

// Call once at app startup
await db.ensureIndexes();
```

#### Graceful shutdown — MANDATORY for every Node.js entry point

ANY crash or termination signal MUST close database connections before exiting.
NEVER call `process.exit()` without closing connections first.

```typescript
// Termination signals — clean exit
process.on('SIGTERM', () => db.gracefulShutdown(0));
process.on('SIGINT', () => db.gracefulShutdown(0));

// Crashes — close connections, then exit with error code
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  db.gracefulShutdown(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  db.gracefulShutdown(1);
});
```

`db.gracefulShutdown()` is idempotent — safe to call from multiple signals.

#### Test queries — `scripts/db-query.ts` (MANDATORY pattern)

**ABSOLUTE RULE: ALL ad-hoc / test / dev database queries go through the db-query system. No exceptions.**

When a developer asks to "look something up in the database", "check a collection", "find a user", or any exploratory query:

1. **Create a query file** in `scripts/queries/<descriptive-name>.ts`
2. **Register it** in `scripts/db-query.ts` query registry
3. **NEVER** create standalone scripts, one-off files, or inline queries in `src/`

```typescript
// scripts/queries/find-expired-sessions.ts
import type { StrictDB } from 'strictdb';

export default {
  name: 'find-expired-sessions',
  description: 'Find sessions that expired in the last 24 hours',
  async run(db: StrictDB, args: string[]): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessions = await db.queryMany('sessions',
      { expiresAt: { $lt: cutoff } },
      { sort: { expiresAt: -1 }, limit: 50 },
    );
    console.log(`Found ${sessions.length} expired sessions:`);
    console.log(JSON.stringify(sessions, null, 2));
  },
};
```

Then register in `scripts/db-query.ts`:
```typescript
const queryRegistry = {
  'find-expired-sessions': () => import('./queries/find-expired-sessions.js'),
};
```

Run: `npx tsx scripts/db-query.ts find-expired-sessions`

**Why this matters:**
- **One instance** — prevents connection exhaustion (the #1 Claude Code database failure)
- **One place to change** — swap databases without touching business logic
- **One place to mock** — testing becomes trivial
- **One place for test queries** — no scripts scattered across the project
- **Discoverable** — `npx tsx scripts/db-query.ts --list` shows all available queries

**FORBIDDEN patterns:**
```typescript
// NEVER do this — creates rogue query files outside the system
// scripts/check-users.ts        ← WRONG
// src/utils/debug-query.ts      ← WRONG
// src/handlers/temp-lookup.ts   ← WRONG

// ALWAYS do this — use the db-query system
// scripts/queries/check-users.ts + register in db-query.ts  ← CORRECT
```

### 4. Testing — Explicit Success Criteria

- ALWAYS define explicit success criteria for E2E tests
- "Page loads" is NOT a success criterion
- Every test MUST verify: URL, visible elements, data displayed
- NEVER write tests without assertions
- Use `/create-e2e <feature>` to create E2E tests with proper structure

```typescript
// CORRECT — explicit success criteria (MINIMUM 3 assertions per test)
await expect(page).toHaveURL('/dashboard');              // 1. URL
await expect(page.locator('h1')).toContainText('Welcome'); // 2. Element visible
await expect(page.locator('[data-testid="user"]')).toContainText('test@example.com'); // 3. Data correct

// WRONG — passes even if broken
await page.goto('/dashboard');
// no assertion!
```

**A test is NOT finished until it has:**
- At least one URL assertion (`toHaveURL`)
- At least one element visibility assertion (`toBeVisible`)
- At least one content/data assertion (`toContainText`, `toHaveValue`)
- Error case coverage (what happens when it fails?)

**E2E test execution — ALWAYS kills test ports first:**
```bash
pnpm test:e2e          # kills ports 4000/4010/4020 → spawns servers → runs Playwright
pnpm test:e2e:headed   # same but with visible browser
pnpm test:e2e:ui       # same but with Playwright UI mode
```

E2E tests run on TEST ports (4000, 4010, 4020) — never dev ports.
`playwright.config.ts` spawns servers automatically via `webServer`.

### 5. NEVER Hardcode Credentials

- ALWAYS use environment variables for secrets
- NEVER put API keys, passwords, or tokens directly in code
- NEVER hardcode connection strings — use STRICTDB_URI from .env

### 6. ALWAYS Ask Before Deploying

- NEVER auto-deploy, even if the fix seems simple
- NEVER assume approval — wait for explicit "yes, deploy"
- ALWAYS ask before deploying to production

### 7. Quality Gates

- No file > 300 lines (split if larger)
- No function > 50 lines (extract helper functions)
- All tests must pass before committing
- TypeScript must compile with no errors (`tsc --noEmit`)

### 8. Parallelize Independent Awaits

- When multiple `await` calls are independent (none depends on another's result), ALWAYS use `Promise.all`
- NEVER await independent operations sequentially — it wastes time
- Before writing sequential awaits, evaluate: does the second call need the first call's result?

```typescript
// CORRECT — independent operations run in parallel
const [users, products, orders] = await Promise.all([
  getUsers(),
  getProducts(),
  getOrders(),
]);

// WRONG — sequential when they don't depend on each other
const users = await getUsers();
const products = await getProducts();  // waits for users unnecessarily
const orders = await getOrders();      // waits for products unnecessarily
```

```typescript
// CORRECT — sequential when there IS a dependency
const user = await getUserById(id);
const orders = await getOrdersByUserId(user.id); // needs user.id
```

### 9. MDD Version — ALWAYS Bump When Editing mdd.md

When modifying `.claude/commands/mdd.md` for any reason (new mode, bug fix, behaviour change), **always increment `mdd_version`** in the frontmatter (line 6) before committing. A pre-commit hook enforces this and will block the commit if the version wasn't bumped.

```
# In .claude/commands/mdd.md frontmatter:
mdd_version: 4   ← increment this when changing the file
```

This is what allows `/install-global mdd` to detect that an update is available and push the new version to every project on the machine.

### 10. Git Workflow — NEVER Work Directly on Main

**Auto-branch is ON by default.** A hook blocks commits to `main`. To avoid wasted work, **ALWAYS check and branch BEFORE editing any files:**

```bash
# MANDATORY first step — do this BEFORE writing or editing anything:
git branch --show-current
# If on main → create a feature branch IMMEDIATELY:
git checkout -b feat/<task-name>
# NOW start working.
```

**Branch naming conventions:**
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation changes
- `refactor/<name>` — code refactors
- `chore/<name>` — maintenance tasks
- `test/<name>` — test additions

**Why branch FIRST, not at commit time:**
- The `check-branch.sh` hook blocks `git commit` on `main`
- If you edit 10 files on `main` then try to commit, you'll be blocked and have to branch retroactively
- Branching first costs 1 second. Branching after being blocked wastes time and creates messy history.

- Use `/worktree <branch-name>` when you want a separate directory (parallel sessions)
- If Claude screws up on a feature branch, delete it — main is untouched

```bash
# For parallel sessions (separate directories):
/worktree add-auth                # creates branch + separate working directory

# To disable auto-branching:
# Set auto_branch = false in claude-mastery-project.conf
```

**Before merging any branch back to main:**
1. Review the full diff: `git diff main...HEAD`
2. Ask the user: "Do you want RuleCatch to check for violations on this branch?"
3. Only merge after the user confirms

**Why this matters:**
- Main should always be deployable
- Feature branches are disposable — delete and start over if needed
- `git diff main...HEAD` shows exactly what changed, making review easy
- Auto-branching means zero friction — you don't have to remember
- Worktrees let you run multiple Claude sessions in parallel without conflicts
- RuleCatch catches violations Claude missed — last line of defense before merge

### 11. Docker Push Gate — Local Test Before Push

**Disabled by default.** When enabled (`docker_test_before_push = true` in `claude-mastery-project.conf`), ANY `docker push` is BLOCKED until the image passes local verification:

1. Build the image
2. Run the container locally
3. Wait 5 seconds for startup
4. Verify container is still running (didn't crash/exit)
5. Hit the health endpoint (must return 200)
6. Check logs for fatal errors
7. Clean up test container
8. **Only then** allow `docker push`

If any step fails: STOP, show what failed, and do NOT push.

```bash
# Enable in claude-mastery-project.conf:
docker_test_before_push = true

# Disable (default):
docker_test_before_push = false
```

This gate applies globally — every command or workflow that pushes to Docker Hub must respect it.

### 12. Definition of Done (DoD) — Every Feature Spec

A spec is **not done** until every item below is true. Run through the list mentally before declaring "ready to commit"; the bugs we shipped over the first 13 specs trace back to skipping one of these.

#### 12.1 Schema / data layer

- [ ] **Zod schema** updated in `packages/shared/src/db/schema.ts` (and inferred type in `packages/shared/src/types/tenant.ts` flows automatically)
- [ ] **SQL migration** added at `scripts/migrations/NNN-<slug>.sql` with quoted camelCase identifiers (`"tenantId"`, etc.)
- [ ] Migration uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so re-runs are safe
- [ ] **CHECK constraints** updated for any new enum value (`ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …`)
- [ ] **Indexes** declared in `registerSchemas()` AND created in the migration
- [ ] If `Ctx` interface changes: **grep `tenantId:.*role:.*email`** to find every constructor and update it. Common locations: `tests/integration/*.test.ts` `ctxFor()` helpers, occasional inline `Ctx` literals in test files.

#### 12.2 Handlers / shared package

- [ ] New handler file written in `packages/shared/src/handlers/<area>/<verb>.ts`
- [ ] **`packages/shared/package.json` `exports` map** updated with the new subpath (skip this and consumers fail with `Cannot find module '@automatebro/shared/X'` even though the file exists)
- [ ] Handler accepts `ctx: Ctx` as last parameter, never reads tenantId from request body
- [ ] Handler uses `repo.*` not `db.*` for tenant-scoped collections
- [ ] StrictDB dynamic-dispatch boundary cast: `as never` on filter/sort/update specs (documented pattern, not a smell)
- [ ] Independent awaits parallelised with `Promise.all` (Critical Rule #8)

#### 12.3 API surface

- [ ] Route lives under `/api/v1/...` (Critical Rule #2)
- [ ] Auth check at the top: `if (ctx === null) return 401` and `if (ctx.tenantId === null) return 400`
- [ ] Body validated through a Zod schema; specific error message on consent/literal failures
- [ ] `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` declared for routes that read cookies / DB
- [ ] If returning a file download: build `new NextResponse(body, { headers })` by hand — `NextResponse.json()` strips `Content-Disposition`

#### 12.4 UI

- [ ] Server Component by default; Client Component only for state / handlers
- [ ] **`data-hydrated="true"` marker** + `useEffect(() => setHydrated(true), [])` on every form
- [ ] Submit button `disabled={submitting || !hydrated || <other-gates>}`
- [ ] **Synchronous double-submit guard** with `useRef(false)` checked at the top of the handler
- [ ] `data-testid` on every interactive element an E2E test will reach
- [ ] If adding a form field that's required, **audit every E2E test that submits this form** (form-fill paths) AND every raw-fetch test that bypasses the form

#### 12.5 Tests

- [ ] Unit test for any pure function (Zod schemas, validators, parsers)
- [ ] Integration test for any handler that touches the DB (gated on `hasInfra`)
- [ ] Cross-tenant isolation test for any new collection: tenant A does the action, assert tenant B's data is untouched
- [ ] E2E test for the full happy path with **≥3 assertions** (URL, element visibility, content) per Critical Rule #4
- [ ] E2E test for the failure path (validation error, missing consent, etc.)
- [ ] Existing E2E tests that hit the changed surface area still pass (consent-gate audit applies)

#### 12.6 Observability

- [ ] Structured Pino log at INFO on success, ERROR on failure
- [ ] No tokens / DM contents / unmasked emails in any log line
- [ ] Sentry tag with `tenantId` on errors

#### 12.7 Documentation

- [ ] `docs/specs/NNN-<slug>.md` written with §1 Goal, §2 Out of scope, §3 Architectural decisions, §4 Files, §5 Tests, §6 Acceptance criteria, §7 Risks
- [ ] `docs/TODO_BUILD.md` updated — move from "outstanding" to "shipped"
- [ ] `CLAUDE.md` "Lessons learned" section appended with anything new (immediately, not "later")

#### 12.8 Smoke gate (pre-commit)

Run `pnpm smoke` (which is `typecheck && lint && test:unit && next build`). All four must pass. Don't bypass by editing the script.

### 13. Trigger-Type Addition Checklist

Adding a new automation trigger (`comment`, `dm`, `storyReply`, `mention`, `liveComment`, …) is the highest-blast-radius change pattern in this codebase. Skipping any of these results in silent regression. **All eight bullets are mandatory:**

1. **Zod enum** — extend `AutomationSchema.trigger` enum in `packages/shared/src/db/schema.ts`
2. **Event kind** — if the trigger fires off a webhook event kind that doesn't exist yet, extend `EventSchema.kind` enum too
3. **DB migration** — `ALTER TABLE "automations" DROP CONSTRAINT "automations_trigger_check"; ALTER TABLE "automations" ADD CONSTRAINT "automations_trigger_check" CHECK ("trigger" IN ('comment','dm', …))`. Same for `events.kind` if changed.
4. **Webhook subscription** — `WEBHOOK_FIELDS` in `packages/shared/src/handlers/igAccounts/connectIgAccount.ts`. Note the Meta lesson (2026-05-04): subscribing to a field without Advanced Access fails the whole call. Subscribe only to fields you have permission for; ship the trigger as "Pending Meta approval" in the UI until then.
5. **`processEvent` dispatcher** — branch on `event.kind` and dispatch to `process<X>Event` handler
6. **New `process<X>Event` handler** — mirror the shape of `processCommentEvent`: load active automations matching the trigger, match keywords, enqueue `send-dm`
7. **UI** — add the option to the trigger dropdown in `apps/web/components/automations/automation-form.tsx`. Mark "Beta" / "Pending approval" if Meta hasn't granted the permission yet.
8. **Tests** — E2E that creates an automation with the new trigger; integration test that fakes the event and asserts a `send` row is created

### 14. Form-Change Audit

Any change to a form (new field, new gate, removed field) requires:

1. **Form component** updated (state, validation, submit predicate)
2. **API route** updated to validate / pass through the new field
3. **Handler / Zod input schema** updated
4. **Existing E2E tests** that fill this form: grep for the form's `data-testid` (e.g. `getByTestId('workspace-submit')`) and update every fill+click sequence
5. **Existing raw-fetch tests** that bypass the form: grep for the API path (e.g. `/api/v1/tenants`) and update request bodies
6. **Lessons learned** in `CLAUDE.md` if the change pattern is novel

---

## Featured Packages

Open-source packages by [TheDecipherist](https://github.com/TheDecipherist) (the developer of this starter kit) are integrated into project profiles. All are MIT-licensed.

### ClassMCP (MCP Server) — Semantic CSS for AI

Provides semantic CSS class patterns to Claude via MCP, reducing token usage when working with styles. Auto-included in CSS-enabled profiles (`mcp` field in `claude-mastery-project.conf`).

```bash
claude mcp add classmcp -- npx -y classmcp@latest
```

npm: [classmcp](https://www.npmjs.com/package/classmcp)

### Classpresso — Post-Build CSS Optimization

Consolidates CSS classes after build for 50% faster style recalculation with zero runtime overhead. Auto-included as a devDependency in CSS-enabled profiles; runs via `pnpm build:optimize` (also auto-runs as `postbuild`).

```bash
pnpm add -D classpresso
```

npm: [classpresso](https://www.npmjs.com/package/classpresso)

### StrictDB-MCP (MCP Server) — Database Access for AI

Gives AI agents direct database access through 14 MCP tools with full guardrails, sanitization, and error handling. Auto-included in database-enabled profiles (`mcp` field in `claude-mastery-project.conf`).

```bash
claude mcp add strictdb -- npx -y strictdb-mcp@latest
```

npm: [strictdb-mcp](https://www.npmjs.com/package/strictdb-mcp)

### TerseJSON (Optional) — Memory-Efficient JSON

Proxy-based lazy JSON expansion achieving ~70% memory reduction. **Not auto-included** — install only if your project handles large JSON payloads.

```bash
pnpm add tersejson
```

npm: [tersejson](https://www.npmjs.com/package/tersejson)

---

## When Something Seems Wrong

Before jumping to conclusions:

- Missing UI element? → Check feature gates BEFORE assuming bug
- Empty data? → Check if services are running BEFORE assuming broken
- 404 error? → Check service separation BEFORE adding endpoint
- Auth failing? → Check which auth system BEFORE debugging
- Test failing? → Read the error message fully BEFORE changing code

---

## Windows Users — Use VS Code in WSL Mode

If you're on Windows, you should be running VS Code in **WSL 2 mode**. Most people don't know this exists and it dramatically changes everything:

- **HMR is 5-10x faster** — file changes don't cross the Windows/Linux boundary
- **Playwright tests run significantly faster** — native Linux browser processes
- **File watching actually works** — `tsx watch`, `next dev`, `nodemon` are all reliable
- **Node.js filesystem operations** avoid the slow NTFS translation layer
- **Claude Code runs faster** — native Linux tools (`grep`, `find`, `git`)

**CRITICAL:** Your project must be on the **WSL filesystem** (`~/projects/`), NOT on `/mnt/c/`. Having WSL but keeping your project on the Windows filesystem gives you the worst of both worlds.

```bash
# Check if you're set up correctly:
pwd
# GOOD: /home/you/projects/my-app
# BAD:  /mnt/c/Users/you/projects/my-app  ← still hitting Windows filesystem

# VS Code: click green "><" icon bottom-left → "Connect to WSL"
```

Run `/setup` to auto-detect your environment and get specific instructions.

---

## Service Ports (FIXED — NEVER CHANGE)

| Service | Dev Port | Test Port | URL |
|---------|----------|-----------|-----|
| Website | 3000 | 4000 | http://localhost:{port} |
| API | 3001 | 4010 | http://localhost:{port} |
| Dashboard | 3002 | 4020 | http://localhost:{port} |

When starting any service, ALWAYS use its assigned port:

```bash
# CORRECT
npx next dev -p 3002

# WRONG — never let it default
npx next dev
```

Before starting services, ALWAYS kill existing processes on those ports:

```bash
lsof -ti:3000,3001,3002 | xargs kill -9 2>/dev/null
```

---

## Project Structure

```
project/
├── CLAUDE.md              # You are here
├── CLAUDE.local.md        # Personal overrides (gitignored)
├── .claude/
│   ├── commands/          # Slash commands (/review, /refactor, /worktree, /new-project, etc.)
│   ├── skills/            # Triggered expertise & scaffolding templates
│   ├── agents/            # Custom subagents
│   └── hooks/             # Enforcement scripts (9 hooks: secrets, branch, ports, rybbit, e2e, lint, env-sync, rulecatch)
├── project-docs/
│   ├── ARCHITECTURE.md    # System overview & data flow
│   ├── INFRASTRUCTURE.md  # Deployment & environment details
│   └── DECISIONS.md       # Why we chose X over Y
├── docs/                  # GitHub Pages site
│   └── user-guide.html   # Interactive User Guide (HTML)
├── src/
│   ├── handlers/          # Business logic
│   ├── adapters/          # External service wrappers
│   └── types/             # Shared TypeScript types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/
│   ├── db-query.ts        # Test Query Master — index of all dev/test queries
│   ├── queries/           # Individual query files (dev/test only, NOT production)
│   ├── build-content.ts   # Markdown → HTML article builder
│   └── content.config.json # Article registry (source, output, SEO metadata)
├── content/               # Markdown source files for articles/posts
├── USER_GUIDE.md          # Comprehensive User Guide (Markdown)
├── .env.example           # Template with placeholders (committed)
├── .env                   # Actual secrets (NEVER committed)
├── .gitignore
├── .dockerignore
├── package.json           # All scripts: dev, test, db:query, content:build, ai:monitor
├── claude-mastery-project.conf # Profile presets for /new-project (clean, default, api, go, etc.)
├── playwright.config.ts   # E2E test config (test ports 4000/4010/4020, webServer)
├── vitest.config.ts       # Unit/integration test config
└── tsconfig.json
```

---

## Project Documentation

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `project-docs/ARCHITECTURE.md` | System overview & data flow | Before architectural changes |
| `project-docs/INFRASTRUCTURE.md` | Deployment details | Before environment changes |
| `project-docs/DECISIONS.md` | Architectural decisions | Before proposing alternatives |

**ALWAYS read relevant docs before making cross-service changes.**

---

## Coding Standards

### Imports

```typescript
// CORRECT — explicit, typed
import { getUserById } from './handlers/users.js';
import type { User } from './types/index.js';

// WRONG — barrel imports that pull everything
import * as everything from './index.js';
```

### Error Handling

```typescript
// CORRECT — handle errors explicitly
try {
  const user = await getUserById(id);
  if (!user) throw new NotFoundError('User not found');
  return user;
} catch (err) {
  logger.error('Failed to get user', { id, error: err });
  throw err;
}

// WRONG — swallow errors silently
try {
  return await getUserById(id);
} catch {
  return null; // silent failure
}
```

### Go (Gin / Chi / Echo / Fiber / stdlib)

When working on a Go project (detected by `go.mod` in root or `language = go` in profile):

- **Standard layout:** `cmd/` for entry points, `internal/` for private packages — follow Go conventions
- **Go modules:** Always use `go.mod` / `go.sum` — NEVER use `GOPATH` mode or `dep`
- **golangci-lint:** Run `golangci-lint run` before committing — config in `.golangci.yml`
- **Table-driven tests:** Use `[]struct{ name string; ... }` pattern for multiple test cases
- **context.Context:** Every I/O function accepts `ctx context.Context` as first parameter
- **Interfaces:** Accept interfaces, return structs — define interfaces at the consumer
- **Error handling:** NEVER ignore errors with `_` — always check and wrap with `fmt.Errorf("context: %w", err)`
- **No global mutable state:** Pass dependencies via struct fields, not package-level vars
- **Graceful shutdown:** Handle SIGINT/SIGTERM, close DB connections with `context.WithTimeout`
- **API versioning:** Same rule — all endpoints under `/api/v1/` prefix
- **Quality gates:** Same limits — no file > 300 lines, no function > 50 lines
- **Makefile:** Use `make build`, `make test`, `make lint` — NOT raw `go` commands in scripts

### Python (FastAPI / Django / Flask)

When working on a Python project (detected by `pyproject.toml` in root or `language = python` in profile):

- **Type hints ALWAYS:** Every function MUST have type hints for all parameters AND return type
- **Modern syntax:** Use `str | None` (not `Optional[str]`), `list[str]` (not `List[str]`)
- **Async consistently:** FastAPI handlers must be `async def` for I/O operations
- **pytest only:** NEVER use unittest — use pytest with `@pytest.mark.parametrize` for table-driven tests
- **Virtual environment:** ALWAYS use `.venv/` — NEVER install packages globally
- **Pydantic models:** Use Pydantic `BaseModel` for all request/response schemas
- **Pydantic settings:** Use `pydantic-settings` `BaseSettings` for environment config
- **ruff:** Run `ruff check` before committing — config in `ruff.toml` or `pyproject.toml`
- **API versioning:** Same rule — all endpoints under `/api/v1/` prefix
- **Quality gates:** Same limits — no file > 300 lines, no function > 50 lines
- **Makefile:** Use `make dev`, `make test`, `make lint` — NOT raw Python commands in scripts
- **Graceful shutdown:** Handle SIGINT/SIGTERM, close database connections before exiting

---

## Naming — NEVER Rename Mid-Project

Renaming packages, modules, or key variables mid-project causes cascading failures that are extremely hard to catch. If you must rename:

1. Create a checklist of ALL files and references first
2. Use IDE semantic rename (not search-and-replace)
3. Full project search for old name after renaming
4. Check: .md files, .txt files, .env files, comments, strings, paths
5. Start a FRESH Claude session after renaming

---

## Plan Mode — Plan First, Code Second

**For any non-trivial task, start in plan mode.** Don't let Claude write code until you've agreed on the plan. Bad plan = bad code. Always.

- Use plan mode for: new features, refactors, architectural changes, multi-file edits
- Skip plan mode for: typo fixes, single-line changes, obvious bugs
- One Claude writes the plan. You review it as the engineer. THEN code.

### Step Naming — MANDATORY

Every step in a plan MUST have a consistent, unique name. This is how the user references steps when requesting changes. Claude forgets to update plans — named steps make it unambiguous.

```
CORRECT — named steps the user can reference:
  Step 1 (Project Setup): Initialize repo with TypeScript
  Step 2 (Database Layer): Set up StrictDB
  Step 3 (Auth System): Implement JWT authentication
  Step 4 (API Routes): Create user endpoints
  Step 5 (Testing): Write E2E tests for auth flow

WRONG — generic steps nobody can reference:
  Step 1: Set things up
  Step 2: Build the backend
  Step 3: Add tests
```

### Modifying a Plan — REPLACE, Don't Append

When the user asks to change something in the plan:

1. **FIND** the exact named step being changed
2. **REPLACE** that step's content entirely with the new approach
3. **Review ALL other steps** for contradictions with the change
4. **Rewrite the full updated plan** so the user can see the complete picture

```
CORRECT:
  User: "Change Step 3 (Auth System) to use session cookies instead of JWT"
  Claude: Replaces Step 3 content, checks Steps 4-5 for JWT references,
          outputs the FULL updated plan with Step 3 rewritten

WRONG:
  User: "Actually use session cookies instead"
  Claude: Appends "Also, use session cookies" at the bottom
          ← Step 3 still says JWT. Now the plan contradicts itself.
```

**Claude will forget to do this.** If you notice the plan has contradictions, tell Claude: "Rewrite the full plan — Step 3 and Step 7 contradict each other."

- If fundamentally changing direction: `/clear` → state requirements fresh

---

## Documentation Sync

When updating any feature, keep these locations in sync:

1. `README.md` (repository root)
2. `docs/index.html` (GitHub Pages site)
3. `project-docs/` (relevant documentation)
4. `CLAUDE.md` quick reference table (if adding commands/scripts)
5. `tests/STARTER-KIT-VERIFICATION.md` (if adding hooks/files)
6. Inline code comments
7. Test descriptions

If you update one, update ALL.

### Adding a New Command or Hook — MANDATORY Checklist

When creating a new `.claude/commands/*.md` or `.claude/hooks/*.sh`:

1. **README.md** — Update the command count, project structure tree, and add a description section
2. **docs/index.html** — Update the command count, project structure tree, and add a command card
3. **CLAUDE.md** — Add to the quick reference table (if user-facing)
4. **tests/STARTER-KIT-VERIFICATION.md** — Add verification checklist entry
5. **.claude/settings.json** — Wire up hooks (if adding a hook)

**This is NOT optional.** Every command/hook must appear in all five locations before the commit.

### Command Scope Classification

Every command has a `scope:` field in its YAML frontmatter:

- **`scope: project`** (16 commands) — Work inside any project. Copied to scaffolded projects by `/new-project`, `/convert-project-to-starter-kit`, and `/update-project`.
- **`scope: starter-kit`** (10 commands) — Kit management only. Never copied to scaffolded projects.

**Project commands:** `help`, `review`, `commit`, `progress`, `test-plan`, `architecture`, `security-check`, `optimize-docker`, `create-e2e`, `create-api`, `worktree`, `refactor`, `diagram`, `setup`, `what-is-my-ai-doing`, `show-user-guide`

**Starter-kit commands:** `new-project`, `update-project`, `convert-project-to-starter-kit`, `install-global`, `install-mdd`, `projects-created`, `remove-project`, `set-project-profile-default`, `add-project-setup`, `quickstart`, `add-feature`

When distributing commands (new-project, convert, update), **always filter by `scope: project`** in the source command's frontmatter. Skills, agents, hooks, and settings.json are copied in full regardless of scope.

---

## CLAUDE.md Is Team Memory — The Feedback Loop

Every time Claude makes a mistake, **add a rule to prevent it from happening again.**

This is the single most powerful pattern for improving Claude's behavior over time:

1. Claude makes a mistake (wrong pattern, bad assumption, missed edge case)
2. You fix the mistake
3. You tell Claude: "Update CLAUDE.md so you don't make that mistake again"
4. Claude adds a rule to this file
5. Mistake rates actually drop over time

**This file is checked into git. The whole team benefits from every lesson learned.**

Don't just fix bugs — fix the rules that allowed the bug. Every mistake is a missing rule.

**If RuleCatch is installed:** also add the rule as a custom RuleCatch rule so it's monitored automatically across all future sessions. CLAUDE.md rules are suggestions — RuleCatch enforces them.

---

## Workflow Preferences

- Quality over speed — if unsure, ask before executing
- Plan first, code second — use plan mode for non-trivial tasks
- One task, one chat — `/clear` between unrelated tasks
- One task, one branch — use `/worktree` to isolate work from main
- Use `/context` to check token usage when working on large tasks
- When testing: queue observations, fix in batch (not one at a time)
- Research shows 2% misalignment early in a conversation can cause 40% failure rate by end — start fresh when changing direction

---

# Project: AutomateBro — Instagram DM Automation Platform

> **This is a project-specific section. The rules above (Critical Rules, Quality Gates,
> Git Workflow, StrictDB, Testing, Service Ports, etc.) all still apply. This section
> adds context and constraints specific to AutomateBro on top of them.**

## What we're building

AutomateBro is a creator-first Instagram DM automation platform — a direct competitor
to LinkPlease, ManyChat, and LinkDM, positioned for the Indian creator and D2C market.
Core value prop: flat-rate INR pricing, native AI replies on day one, true unlimited
accounts on the agency tier, and a conversion-attribution dashboard that competitors
lack.

Primary persona: Indian creators (50K–5M followers), coaches, D2C brands, affiliate
marketers, and small agencies managing 1–10 client IG accounts.

## Hard constraints (do not violate, ever)

1. **No browser automation.** Never use Selenium, Puppeteer-against-IG, Playwright-against-IG,
   or any tool that scrapes Instagram's web UI. We are an API-first product. If a feature
   cannot be built on Meta's official Instagram Graph API, we do not ship it.
2. **No password collection.** Users connect via OAuth through Meta's Facebook Login for
   Business. We never see, store, or transmit Instagram credentials.
3. **Respect Meta rate limits.** Cap automated DM sends at 185/hour per IG account
   (7.5% buffer below Meta's ~200/hr practical ceiling). All sends go through a
   per-account rate-limited queue.
4. **Respect the 24-hour messaging window.** Outbound DMs are only sent within 24 hours
   of a user's last interaction with the connected business account, unless using an
   approved message tag. The codebase must enforce this; do not rely on Meta to reject.
5. **Webhook signature verification is mandatory.** Every Meta webhook request must pass
   HMAC-SHA256 signature verification before any handler logic runs. Reject 401 on
   failure, log the attempt.
6. **Idempotency on every external write.** Comments, story replies, and DMs may be
   delivered to our webhook more than once. Every handler keys on Meta's event ID and
   no-ops on duplicates.
7. **Multi-tenant from day 1.** Every collection/table that holds tenant data has a
   `tenantId` field. StrictDB schemas declare this as required and indexed. No
   exceptions, no "we'll add it later."
8. **Encryption at rest for tokens.** Long-lived Page Access Tokens are encrypted with
   AES-256-GCM using a key from the secrets manager before insert. Decrypted only at
   the moment of an outbound API call.

## Tech stack (locked — fits the cc-mastery starter kit)

- **Frontend:** Next.js 15 (App Router) + TypeScript strict + Tailwind + shadcn/ui
- **HTTP:** Next.js API routes under `/api/v1/*` (per starter kit Critical Rule #2)
- **Worker:** Separate Node.js entry point at `src/worker/index.ts`, deployed to Railway
- **Database:** Supabase Postgres, accessed via **StrictDB** with `STRICTDB_URI=postgresql://...`
  (per starter kit Critical Rule #3 — native drivers / Mongoose / Drizzle are FORBIDDEN)
- **Cache + Queue:** Upstash Redis + BullMQ
- **Auth (our users):** Supabase Auth (email + Google)
- **Auth (their IG):** Facebook Login for Business via Meta OAuth
- **Hosting:** Vercel (web/API) + Railway (worker)
- **Payments:** Razorpay (India, primary) + Stripe (global)
- **Email:** Resend
- **Observability:** Sentry (errors) + Axiom (logs) + Better Stack (uptime)
- **Analytics:** PostHog (product) + Plausible (marketing)

If a feature seems to need a different tool, propose it in chat first. Do not silently
introduce new dependencies.

## Service mapping to starter kit ports

| Service | Port (dev) | Port (test) | What lives here |
|---|---|---|---|
| Website | 3000 | 4000 | Marketing site, /pricing, /compare/* SEO pages |
| API | 3001 | 4010 | `/api/v1/webhooks/meta`, `/api/v1/automations/*`, all backend routes |
| Dashboard | 3002 | 4020 | Logged-in tenant dashboard UI |
| Worker | (no port — process) | n/a | BullMQ consumers for `process-event`, `send-dm`, `generate-ai-reply` (lead capture is inline in `process-event` — see spec 009 §3.1) |

Webhook URL exposed by Meta points at the **API service** (3001), NOT website.

## StrictDB schema registration (canonical collection names)

Register these on app startup — `src/db/schema.ts`. Field names use camelCase per starter
kit rules (`scripts/db-query.ts` and adapter layer).

- `tenants` — one per AutomateBro account (workspace)
- `users` — humans with login access
- `tenantUsers` — many-to-many join: user ↔ tenant with role
- `igAccounts` — connected Instagram Business/Creator accounts; belongs to one tenant
- `automations` — a triggered flow (comment, story-reply, DM, ads, live)
- `triggers` — keywords, post selectors, filters bound to an automation
- `responses` — the DM/comment-reply content sent when triggered
- `events` — every webhook event we receive (immutable log, **unique index on `metaEventId`**)
- `sends` — every outbound DM/comment-reply attempt (queued, sent, failed, rate-limited)
- `leads` — contacts captured inside DM flows (with email/phone if collected)
- `subscriptions` — Razorpay/Stripe subscription state per tenant

Every collection EXCEPT `tenants` and `users` has a required indexed `tenantId` field.

## Folder layout (within starter kit's `src/`)

We use the starter kit's `src/handlers/`, `src/adapters/`, `src/types/` convention.
We add three project-specific subdirectories:

```
src/
├── handlers/                    # Existing — business logic
│   ├── webhooks/
│   │   └── meta.ts              # POST /api/v1/webhooks/meta — verify, dedupe, enqueue
│   ├── automations/             # CRUD for automation rules
│   ├── igAccounts/              # OAuth connect, disconnect, refresh
│   └── leads/                   # Lead listing, export
├── adapters/                    # Existing — external service wrappers
│   ├── meta.ts                  # Meta Graph API client (typed, rate-limit aware)
│   ├── razorpay.ts
│   ├── stripe.ts
│   └── resend.ts
├── types/                       # Existing — shared types
│   └── meta-webhook.ts          # Zod schemas for every webhook payload shape
├── worker/                      # NEW — Railway entry point
│   ├── index.ts                 # Worker bootstrap; graceful shutdown
│   └── jobs/
│       ├── processEvent.ts        # dispatcher; handles message → captureLead inline
│       ├── sendDM.ts
│       └── generateAiReply.ts
├── queue/                       # NEW — BullMQ setup
│   ├── queues.ts                # Queue definitions, connection, rate limiter
│   └── jobTypes.ts              # Discriminated unions for every job payload
└── meta/                        # NEW — Meta-specific helpers (not generic adapter)
    ├── verifySignature.ts       # HMAC-SHA256 webhook verification
    ├── oauth.ts                 # Token exchange, encryption, refresh
    └── rateLimiter.ts           # Per-IG-account 185/hr semaphore in Redis

scripts/
└── queries/                     # cc-mastery db-query system (per Critical Rule #3)
    ├── find-pending-sends.ts
    ├── find-stuck-automations.ts
    └── tenant-events-summary.ts
```

## Critical flows (how the product actually works)

**Flow 1 — User connects IG account:**
User logs in to AutomateBro → clicks "Connect Instagram" → redirected to Facebook OAuth
→ grants permissions → we receive a code at `/api/v1/auth/meta/callback` → exchange for
short-lived token → exchange for long-lived Page Access Token → encrypt with AES-256-GCM
→ `db.insertOne('igAccounts', { ...encrypted })` → subscribe to webhook fields
(`comments`, `messages`, `message_reactions`, `mentions`) → confirm with a UI ping.

**Flow 2 — Comment-to-DM:**
Meta fires webhook on comment → `POST /api/v1/webhooks/meta` (port 3001) →
`verifyMetaSignature()` checks HMAC, rejects 401 on fail → `db.insertOne('events', { metaEventId, ... })`
with unique index causing dedupe → enqueue `process-comment` job → worker matches comment
text against tenant's active keyword triggers → if match, enqueue `send-dm` job →
rate limiter checks per-account 185/hr cap in Redis → if under cap, call Meta `/me/messages`
with the recipient's PSID → `db.insertOne('sends', ...)` → on failure, exponential backoff
up to 3 retries.

**Flow 3 — Lead capture inside DM:**
DM auto-reply asks for email → user replies with email → webhook fires on incoming message
→ if active capture flow, parse email with regex → `db.updateOne('leads', { tenantId, igUserId }, { $set: { email } }, true)` (upsert)
→ push to integrations (Mailchimp, Google Sheets, Razorpay customer).

## What we are NOT building (explicit non-goals for v1)

- Bulk follow/unfollow (TOS-violating, off-limits forever)
- Schedule-to-publish posts (different product entirely)
- Hashtag scraping or competitor analysis tools
- AI image generation
- Multi-platform messaging (WhatsApp, Messenger, TikTok come post-launch, not v1)
- Anything requiring access to followers list (Meta does not expose this)

## Project-specific behavior overrides for Claude

These augment — but never contradict — the rules in the cc-mastery section above:

1. **Always read `docs/engineering-plan.md` and the relevant `docs/specs/NNN-*.md` before
   writing code.** If they're not in your context, view them first.
2. **Follow the MDD loop strictly:** Analyze → Document (spec) → Approve → Test (failing
   tests first) → Approve → Code → Review subagent → Approve → Commit. Never skip Document
   or Test.
3. **Stop at gates.** When a phase says "STOP and wait for my approval," stop. Do not
   continue into the next phase.
4. **No invented Meta data.** Webhook payloads, PSIDs, page IDs, app secrets — never
   fabricate examples that look real (`PAGE_ID=12345`). Use clearly-fake placeholders
   like `<your-page-id>` or ask.
5. **No silent dependencies.** If you need a new package (especially anything that touches
   IG, OAuth, queues, or webhooks), propose it with one sentence on why and what you
   considered instead.

## Lessons learned (append-only; commit each addition)

<!-- Format: YYYY-MM-DD — one-sentence rule. -->

### Specs 001–005 lessons (2026-04-30 → 2026-05-03)

**StrictDB / Postgres**
- 2026-05-02 — StrictDB takes collection names LITERALLY at the SQL level. Tables and columns must use quoted camelCase identifiers (`"tenantUsers"`, `"tenantId"`) — Postgres folds unquoted identifiers to lowercase. Convention is preserved-camelCase in BOTH SQL and app code.
- 2026-05-02 — `db.batch([...])` is sequential, NOT transactional. For multi-write atomicity (e.g. tenants + tenantUsers in createTenant), use `db.withTransaction(async (tx) => { … })` which wraps in BEGIN/COMMIT.
- 2026-05-02 — StrictDB's TypeScript generics narrow on the concrete schema name. Dynamic dispatch (collection-name-as-string) requires an `as never` cast at the boundary; the runtime Zod validation still applies.
- 2026-05-02 — `$setOnInsert` alone in an upsert is rejected by StrictDB; combine with `$set: { … }` so the update body has at least one set clause.
- 2026-05-02 — `db.queryMany` enforces a `limit` — every call must include `{ limit: N }` or it throws.
- 2026-05-02 — `db.describe()` / `information_schema` queries don't work; StrictDB only allows queries against registered collections. Smoke-test connection by registering a collection and running `db.count(coll, {})`.

**Migrations**
- 2026-05-02 — Migration runner uses `pg` directly — this is the FIRST documented exception to the "no native pg" rule (StrictDB has no DDL surface). The runner records sha256 checksums and refuses to re-apply edited files.
- 2026-05-02 — Compute migration checksums on LF-normalised content (`replace(/\r\n/g, '\n')` before hashing) so Windows + Linux developers don't see "content changed" errors. `.gitattributes` also forces eol=lf for `*.sql`.

**Multi-tenancy**
- 2026-05-02 — `repo.*` is the chokepoint: it auto-merges `{ tenantId: ctx.tenantId }` and OVERRIDES any `tenantId` the caller put in the filter. Direct `db.*` calls bypass this — only `tenants` / `users` (which have no tenantId) are exempt. Code review enforces "use repo, not db" for handlers.
- 2026-05-02 — `repo.updateOne` also strips `tenantId` from `$set` / `$setOnInsert` payloads. A symmetric defence: scoping the filter prevents READ leaks; stripping tenantId from updates prevents row-MOVE attacks.

**Auth / OAuth**
- 2026-05-02 — Open redirect via `?next=…` or `?returnTo=…` is a real attack against post-auth redirects. Use `safeRedirectPath()` to reject anything except same-origin paths starting with `/` (and not `//`).
- 2026-05-02 — `SUPABASE_SERVICE_ROLE_KEY` should NOT live in shared `Env`. Tests read it from `process.env` directly with `skipIf(!hasInfra)` — keeps the high-privilege key out of every server route's process memory.
- 2026-05-02 — Add `.refine()` checks ensuring `SUPABASE_URL === NEXT_PUBLIC_SUPABASE_URL` (and same for anon keys) — catches misconfigured deploys at boot.
- 2026-05-02 — Browser client reads from `PublicEnv` (a typed const exported from `env.ts`) — never `process.env.NEXT_PUBLIC_*` directly. Preserves the "process.env only in env.ts" rule.

**Crypto**
- 2026-05-03 — AES-GCM without AAD allows row-swap attacks (move tenant A's encrypted bytes onto tenant B's row, decrypt succeeds). ALWAYS bind ciphertext to row identity via `cipher.setAAD(igUserId)` / `decipher.setAAD(igUserId)`.
- 2026-05-03 — OAuth state must be HMAC-SIGNED (defends against forgery without the secret) AND cookie-bound (defends against state replay from a different session). The cookie check must REQUIRE the cookie — checking only when present is a hollow defence.
- 2026-05-03 — Webhook signature verification reads the RAW body via `request.text()`. Once `request.json()` consumes the stream, `request.text()` returns empty. Order matters; do verification first.
- 2026-05-03 — Meta does NOT send a stable event id on webhook deliveries. Synthesise one via SHA-256 of canonical fields (`entry.id|entry.time|change.field|change.value.id|JSON.stringify(value)`). The synthesised id goes into a UNIQUE column on `events.metaEventId` for idempotent dedupe.

**Forms / hydration**
- 2026-05-03 — Playwright clicks fire BEFORE React hydration in dev. Forms submit as native HTML (GET to current URL) instead of triggering `onSubmit`. Add a `data-hydrated="true"` attribute set by `useEffect(() => setHydrated(true), [])`, disable the submit button while `!hydrated`, and have tests `await expect(form).toHaveAttribute('data-hydrated', 'true')` before fill+click.
- 2026-05-03 — `useRef` synchronous guard alongside the React state for double-submit prevention. Setting `submittingRef.current = true` is synchronous; `setSubmitting(true)` is async — Enter pressed mid-flight can fire two submits before disabled propagates.
- 2026-05-03 — On Server Components, read pathname via `headers().get('x-pathname')` after middleware sets it on the FORWARDED REQUEST headers (not response). Pattern: `NextResponse.next({ request: { headers: forwardedHeaders } })` where `forwardedHeaders = new Headers(request.headers)` then `forwardedHeaders.set('x-pathname', pathname)`.
- 2026-05-03 — App Router needs an explicit `app/not-found.tsx`. Without it, Next.js falls back to the legacy pages-router `_error` which uses `<Html>` and breaks `next build` with a confusing prerender error.

**Build / deploy**
- 2026-05-03 — `next build` expects `NODE_ENV=production`. If `.env` has `NODE_ENV=development`, the build emits warnings and fails with `<Html>` errors. Tests/builds run with `unset NODE_ENV` so Next can set it correctly.
- 2026-05-03 — Next.js `serverExternalPackages` for native-binary or eager-import-everything packages (`strictdb`, `pg`, `mongodb`, `mssql`, `mysql2`, `better-sqlite3`, `bullmq`, `ioredis`). Otherwise Webpack tries to bundle MongoDB's optional peer deps (`aws4`, `kerberos`, `snappy`) and fails.
- 2026-05-03 — pnpm's `pnpm <pkg> dev -- -p N` doesn't work with Next 15 — pnpm passes `--` to next which interprets it as the project directory. Use `pnpm --filter <pkg> exec next dev -p N` instead.
- 2026-05-03 — `tsx` direct + Windows + SIGINT: `proc.kill('SIGINT')` on Windows hard-kills the child instead of sending a real signal, so the worker's signal handler never runs. Test split: SIGINT-dependent tests skip on Windows (`describe.skipIf(!hasInfra || isWindows)`), boot+heartbeat tests run cross-platform.

**Tests**
- 2026-05-03 — Playwright `fullyParallel: true` causes race conditions when tests share a dev server + Supabase project. Use `fullyParallel: false` + `workers: 1` (serial) for stability.
- 2026-05-03 — `tests/e2e/*.spec.ts` cleanup helpers import `pg` directly because Playwright runs out-of-process from the dev server (no `getDb()` singleton available). This is the SECOND documented exception to "no native pg" (alongside `scripts/db-migrate.ts`).
- 2026-05-03 — In test files, `process.env.X = undefined` sets the LITERAL string `"undefined"`. Use `delete process.env.X` instead (with `// biome-ignore lint/performance/noDelete` since Biome flags it).

### Spec 006 lessons (2026-05-03)

- 2026-05-03 — BullMQ's `groupKey` per-key rate limiter is a **Pro-only** feature. OSS BullMQ's `Worker.limiter` is GLOBAL across all jobs. For per-account rate limiting, implement a Redis sliding-window sorted set inside the handler (lands in spec 007's sendDM).
- 2026-05-03 — `Queue.add(name, data, { group: { id: ... } })` won't typecheck with OSS BullMQ — `group` is a Pro-only `JobsOptions` field.
- 2026-05-03 — `packages/shared/package.json` `exports` map MUST list every subpath consumers import (`./queue/jobTypes`, `./types/tenant`, etc.). Missing entries cause `Cannot find module '@automatebro/shared/X'` at typecheck time even though the file exists. When adding new files under `packages/shared/src/`, also add the export.
- 2026-05-03 — Vitest tests at root that import `bullmq`/`ioredis`/`pg` directly need those packages in **root** `devDependencies`, not just in `apps/*` or `packages/*`. pnpm workspace isolation means root tests can't reach into workspace `node_modules`.
- 2026-05-03 — When Worker.close() is called during shutdown, BullMQ waits for in-flight jobs to finish before resolving. Always call `worker.close()` BEFORE `closeQueue()` and `closeDb()` so jobs don't get killed mid-DB-write.
- 2026-05-03 — Job handler stubs (for unimplemented future-spec types) must NOT throw — BullMQ would retry the job and pile up failures. Stubs log + return successfully; the real implementation lands in the dedicated spec.
- 2026-05-03 — Discriminated-union job payloads with `z.discriminatedUnion('type', [...])` give us type narrowing in the dispatcher (`switch (data.type)`) and a single Zod parse before any handler logic — every job validates against the same schema.

### Spec 007 lessons (2026-05-03)

- 2026-05-03 — TypeScript with `exactOptionalPropertyTypes` rejects `null as const` and `null as null` returns from async helpers used in discriminated-union returns. Use a named `type AuthResult = { ctx: AuthCtx; response: null } | { ctx: null; response: NextResponse }` and the union narrows correctly. Saves five minutes of head-scratching.
- 2026-05-03 — `db.queryMany('events', filter, { sort: { receivedAt: -1 } })` doesn't typecheck because StrictDB's SortSpec generic narrows on the registered schema's keys — `receivedAt` IS in EventSchema but the dynamic call site loses it. Cast the sort object: `{ sort: { receivedAt: -1 } as never }`. Same pattern as the filter casts in repo.ts.
- 2026-05-03 — Redis sliding-window rate limit pattern: `ZREMRANGEBYSCORE` (evict expired), `ZADD` (add current attempt with score=now), `ZCARD` (count), `EXPIRE` (auto-cleanup). If `ZCARD > cap`, `ZREM` your just-added member to roll back. Pipeline for atomicity (BullMQ Pro's `groupKey` is the alternative, paid).
- 2026-05-03 — Decryption needs the SAME AAD as encryption. In sendDM, `decryptToken({ ciphertext, iv, tag }, account.igUserId)` — `igUserId` is what we used at encrypt time in connectIgAccount. Passing the wrong AAD throws an authentication-tag-mismatch error.
- 2026-05-03 — Job handler stubs (spec 006) had to NOT throw. Real handlers (spec 007 sendDM) DO throw on retryable failures so BullMQ retries with backoff. Two paths: 4xx (`status: 'failed'`, mark and stop, return); 5xx/timeout/rate-limit (`throw err with retryable=true`, BullMQ delays + retries).
- 2026-05-03 — Postgres CHECK constraints on enum-like columns (`status IN ('queued','sent', ...)`) catch typos at insert time. Worth the 5 lines of SQL — silent data corruption is otherwise the easy failure mode.
- 2026-05-03 — `withTransaction` for multi-row creates: `createAutomation` inserts 3 rows (automations + triggers + responses). If any fails, none persist. Without it, a partial automation breaks listAutomations later (orphan rows).

### Spec 008 lessons (2026-05-03)

- 2026-05-03 — OpenAI gpt-4o-mini pricing as of 2026: $0.15/1M input + $0.60/1M output. Convert to paise via `INR_PER_USD = 84` cached constant (close enough for cost tracking — exact rate matters when settling, not estimating). Hard-code in `adapters/openai.ts` and update at each spec.
- 2026-05-03 — When AI is optional (key not yet provisioned), the handler must gracefully degrade to fallback template instead of throwing. Pattern: `if (apiKey === undefined || apiKey === '') { use fallback; enqueue send-dm; return 'no-key-fallback' }`. BullMQ retries throws — degrade-to-fallback is the right model when the failure is "configuration not yet complete."
- 2026-05-03 — Moderation API outage is non-fatal — log + proceed with the AI output. Reasoning: a moderation outage shouldn't block all AI replies; the chatCompletion model has built-in safety training as the secondary line of defence.
- 2026-05-03 — Lazy-create + race-tolerate the `aiUsage` row: try `insertOne`; on unique-violation, re-read. Two concurrent jobs for the same tenant in the same month can race; the second insert fails on UNIQUE(tenantId, month) and we just use the existing row.
- 2026-05-03 — For optional env vars referenced by handlers: declare in Zod as `.optional()`, then check `apiKey === undefined || apiKey === ''` in the handler — the empty string and undefined arise from different paths (`.env` empty assignment vs. unset). Both must be handled.

### Spec 009 lessons (2026-05-03)

- 2026-05-03 — RFC 4180 CSV escaping is 4 lines: if the cell contains `"`, `,`, `\n`, or `\r`, wrap in `"…"` and double any embedded `"`. No need for a CSV library for ≤10 columns.
- 2026-05-03 — Set `Content-Disposition: attachment; filename="leads-YYYY-MM-DD.csv"` so browsers download instead of trying to render. Pair with `Content-Type: text/csv; charset=utf-8`.
- 2026-05-03 — `$set` + `$setOnInsert` upsert pattern for "first seen / last seen" columns: `$set: { lastSeenAt }` (always overwritten), `$setOnInsert: { firstSeenAt, _id, identity-fields }` (write-once). The unique index on `(tenantId, igAccountId, igUserId)` enforces single-row-per-end-user.
- 2026-05-03 — Phone normalisation: strip non-digits, preserve `+` prefix, validate 10–15 digits total (covers India + international). Indian-friendly regex `(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\d` matches a wider net than RFC 3966; tighten if false-positive rate is high.

### Spec 011 lessons (2026-05-03)

- 2026-05-03 — `React.cache()` on `getCtx()` is essential when layout + page both call it. Without it, every Server Component that calls `getCtx()` fires a separate `supabase.auth.getUser()` round-trip. Wrap once: `export const getCtx = cache(async () => { … })`.
- 2026-05-03 — `exactOptionalPropertyTypes: true` rejects `{ current?: string }` when passing `string | undefined`. Declare the prop as `{ current?: string | undefined }` explicitly so the union is spelled out.
- 2026-05-03 — Client Component mutation buttons (pause/delete) need the same double-click guard as forms: a `useRef(false)` checked synchronously at the top of the handler. `useState` alone is async and doesn't prevent rapid clicks.
- 2026-05-03 — `encodeURIComponent(id)` in fetch URLs for PATCH/DELETE — UUIDs are safe today, but the defensive pattern costs nothing and prevents injection if the id format changes.
- 2026-05-03 — Hydration sentinel pattern for forms: `data-hydrated` set via `useEffect(() => setHydrated(true), [])`, submit button disabled until hydrated, and E2E tests `await expect(form).toHaveAttribute('data-hydrated', 'true')` before fill+click. This prevents Playwright clicking before React hydrates (which causes native HTML form submission).
- 2026-05-03 — Server Components reading `searchParams` in Next.js 15 App Router receive them as a `Promise` — must `await searchParams` before accessing properties. This changed from Next 14 where it was synchronous.

### Meta integration lessons (2026-05-04)

**Dual secrets**
- 2026-05-04 — Instagram Login API uses TWO different secrets: the **Facebook App Secret** (`META_APP_SECRET`) for OAuth token exchange / state HMAC, and the **Instagram App Secret** (`META_IG_APP_SECRET`) for webhook HMAC-SHA256 signature verification. These are different values from different places in the Meta Dashboard. Never conflate them.

**Webhook subscriptions**
- 2026-05-04 — `subscribePageToWebhooks()` calls `POST /{pageId}/subscribed_apps` — this is the Facebook Pages API. For Instagram Business Login webhooks, subscription is configured **in the Meta Dashboard under the Instagram product**, not via API. The API call may silently fail or do nothing.
- 2026-05-04 — Meta Dashboard has a **general Webhooks page** and a **per-product webhook config** (under Instagram product). Only the per-product config delivers real Instagram events. The general Webhooks page only sends canned test payloads (`entry.id = "0"`, `username = "test"`).
- 2026-05-04 — In Development mode, Meta only sends test payloads (fake data) — never real Instagram events. The app must be in **Live mode** to receive real comment/message webhooks. The "To receive webhooks, app mode should be set to Live" info banner in the Instagram product settings confirms this.
- 2026-05-04 — `WEBHOOK_FIELDS` that include permissions without Advanced Access (e.g. `messages` needing `instagram_manage_messages`) cause the entire `subscribePageToWebhooks()` call to fail. Subscribe only to fields you have permission for (e.g. just `['comments']` initially).

**Deployment**
- 2026-05-04 — `@automatebro/shared` exports raw `.ts` files (no build step). The worker cannot use compiled JS (`tsc` output) because `import '@automatebro/shared/env'` resolves to `.ts` source. Use `tsx` (or `ts-node`) on Railway instead of raw `node`. Move `tsx` from devDependencies to dependencies so it's available in production.
- 2026-05-04 — Vercel + Railway both deploy directly from git — no Docker needed. Vercel handles Next.js natively, Railway runs Node.js with Nixpacks. Skip Dockerfile unless deploying to container-only platforms (ECS, Cloud Run).

### Spec 012 + 013 lessons (2026-05-05)

**Marketing site (spec 012)**
- 2026-05-05 — Next.js App Router route groups `(marketing)` are the right escape valve when you want a shared layout (header + footer + cookie banner) for an arbitrary set of public URLs without nesting them in a folder that shows up in the URL. The trade-off: any pre-existing `app/page.tsx` collides with `app/(marketing)/page.tsx` for `/` — `next build` errors out with "two parallel pages resolved to the same path" until you delete the old one.
- 2026-05-05 — Static rendering for marketing pages requires zero `getCtx()`, zero `headers()`, zero `cookies()`. A single import of `@supabase/ssr`'s `createServerClient` flips the page to dynamic and you lose the edge-cache win — visible in `next build` output as `ƒ` instead of `○`. Verify by reading the build output table; don't trust intent.
- 2026-05-05 — `notFound()` from `next/navigation` is the canonical 404 trigger in dynamic route handlers. Returning `null` or throwing a generic Error renders a 500 instead. For SSG-prerendered routes, use `generateStaticParams` to enumerate the valid slugs at build time so unknown slugs hit `notFound()` per request without database lookups.
- 2026-05-05 — Dynamic-route `params` in Next.js 15 are a `Promise` (same as `searchParams`). `generateMetadata` and the page component both must `await params`. TypeScript's narrow on `params: { slug: string }` won't catch this — runtime failure only.
- 2026-05-05 — `metadataBase: new URL(SITE_URL)` is the only place the site URL is needed for OpenGraph image absolutisation. Default it via `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://automatebro.com'` so previews work without env config.

**DPDP / privacy (spec 013)**
- 2026-05-05 — Soft-delete via getCtx is cleaner than RLS or `repo`-layer filters. Joining `tenants` inside `buildCtx` and treating `deletedAt !== null` as "no tenant" means every existing handler stays ignorant — `repo.*` keeps doing what it does, the auth layer just hides the row. One join cost, every handler benefits.
- 2026-05-05 — Distinguishing "pre-tenant onboarding" (`tenantId === null`, never had a tenant) from "post-deletion" (`tenantId === null`, had a tenant that's been soft-deleted) requires a second flag on `Ctx`. Adding `tenantDeleted: boolean` lets the (app) layout redirect deleted users to `/deleted` instead of `/onboarding`. Without it both states collapse to "no tenant" and the UX is wrong.
- 2026-05-05 — Adding a field to `Ctx` requires updating every test file that constructs `Ctx` literals. Search for `tenantId:.*role:.*email` to find them — typically the integration test fixture `ctxFor()` helpers. Forgetting one causes typecheck to fail in only that file.
- 2026-05-05 — `NextResponse.json()` strips `Content-Disposition` headers on some Vercel adapters because it owns the content-type. For file-download responses (export endpoint, CSV, ZIP) build `new NextResponse(stringifiedBody, { headers: {...} })` by hand and serialise the JSON yourself.
- 2026-05-05 — Typed-confirmation modals (force user to type `DELETE` before destructive button activates) reuse the form patterns from spec 011: a `useRef(false)` synchronous double-submit guard plus an exact-string-equality check for the submit-enable predicate. `confirmText === 'DELETE'` not `confirmText.includes('DELETE')` — substring matches fire on partial typing.
- 2026-05-05 — Postgres `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + a partial index where `deletionRequestedAt IS NOT NULL` is the cheapest way to add a "soft-deleted at" timestamp. Partial index keeps the index small (only deleted rows are in it) and the cron-job lookup is `WHERE deletionRequestedAt < now() - interval '30 days'` — one index scan, no full-table sequential.
- 2026-05-05 — Workspace deletion does NOT call Meta's `/me/permissions` DELETE — that requires an active access token and we may have already revoked / lost it by deletion time. We disconnect the local `igAccounts.disconnectedAt` and document in the privacy policy that the tenant should revoke from Facebook Business Integrations themselves. Cleaner consent boundary.
- 2026-05-05 — Required-checkbox consent gates need three layers: Zod literal `z.literal(true)` at the API boundary; HTML `required` + disabled submit on the form; and a server-side error message that's specific (`"Processing consent is required"`) so operators can debug without reading the Zod tree. The Zod literal alone is not enough — the form silently skipping submit is bad UX.
- 2026-05-05 — Existing form-submit E2E tests break when you add a required consent checkbox to the form. Search for `getByTestId('workspace-submit').click()` (or signup-submit) and add `getByTestId('workspace-processing-consent').check()` before the click. Same for any raw-fetch tests bypassing the form (e.g. duplicate-tenant 409 test) — add `processingConsent: true` to the request body.
- 2026-05-05 — Biome's `lint/a11y/useSemanticElements` flags `<div role="dialog">` and recommends `<dialog>`. Native `<dialog>` requires `showModal()` programmatic open and brings its own `::backdrop` styling. For Tailwind-styled custom modals, suppress the rule with `// biome-ignore lint/a11y/useSemanticElements: <reason>` — the ARIA-equivalent div is well-supported by screen readers.

### Spec 015 lessons (2026-05-05)

**DM-keyword automation — first real exercise of CLAUDE.md §13 trigger-addition checklist**
- 2026-05-05 — Postgres `CHECK ("trigger" IN (...))` constraints declared inline get auto-named `automations_trigger_check`. To extend the enum, the migration is `ALTER TABLE … DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT … CHECK …` wrapped in a `BEGIN; … COMMIT;` transaction so no insert can sneak through with a value the new constraint rejects. The `IF EXISTS` makes the migration re-runnable.
- 2026-05-05 — Parallel dispatch of two handlers from `processEvent` (`captureLead` + `processDmEvent` for `kind=message`) introduces a partial-failure retry hazard: if `processDmEvent` enqueues a send then throws, BullMQ retries the whole job and the second invocation re-enqueues another send. Mitigation: `processDmEvent` checks `db.count('sends', { eventId })` at the top and bails if any send already exists for this event. `processCommentEvent` has the same theoretical hazard (mid-loop throw after partial enqueue) and should adopt the same defence in a follow-up cleanup.
- 2026-05-05 — `pnpm smoke` (typecheck + lint + test:unit + next build) is the right pre-commit gate shape. Lint runs `biome check` only — the script intentionally does NOT auto-fix to keep CI deterministic. If lint fails on a local run, run `pnpm exec biome check --write .` separately, then re-run smoke.
- 2026-05-05 — Adding a value to a Zod enum (`AutomationSchema.trigger`) automatically flows through `z.infer` to the `Automation` type — no manual type update needed. Also update the `CreateAutomationInput` Zod schema in the handler (separate enum literal that doesn't derive from the schema) and the inline UI literal types in form components (`type TriggerType = ...`).
- 2026-05-05 — When a feature reuses an existing API surface (`POST /api/v1/automations` accepted a `trigger` field already), no new route is needed. Verify by grepping the route handler for the field name; in our case `automations/route.ts` already passed `trigger` through to `createAutomation`. Adding a fourth enum value needed zero route changes.
- 2026-05-05 — Windows + OneDrive + Next.js: `.next/diagnostics/build-diagnostics.json` occasionally errors with `EINVAL: invalid argument, readlink` because OneDrive holds a stale symlink. Fix: `rm -rf apps/web/.next` then re-run `next build`. Windows-environment quirk, not a Next.js bug.

### Spec 016 lessons (2026-05-05)

**AI intent classifier (smart triggers)**
- 2026-05-05 — OpenAI's `response_format: { type: 'json_object' }` is the right way to force structured classifier output on `gpt-4o-mini`. Pair it with `temperature: 0.0` and `max_tokens: 30` and you get deterministic 5–15 token JSON responses. Defensive parsing still required: validate the parsed JSON against the expected enum (fall back to `'other'` on unknown labels) and clamp `confidence` to [0,1].
- 2026-05-05 — Confidence floor pattern: classifier outputs `confidence < 0.5` get coerced to `'other'` so we don't act on low-confidence labels. The "AI smart trigger" is only meaningful when the classifier is sure; below the floor we treat the event as ambiguous and let the rest of the pipeline (keyword matching) decide.
- 2026-05-05 — Persisting the classification on `events` (not `sends` or per-automation) gives idempotent retries for free: `if (event.intent !== null) return early`. Multiple matching automations share the single classification call. One OpenAI round-trip per event regardless of how many automations would match it.
- 2026-05-05 — Intent gate semantics: `null` or `[]` on `triggers.intents` means "any intent fires" (backwards-compatible default). When the gate is set but the event is **unclassified** (cap exceeded, OpenAI failure), bypass the gate rather than silencing the trigger. Logged as a warning so an operator can surface it. Trade-off: spam-intent fires might leak through if a tenant relies on the gate to silence them, but the alternative — silent automations — is worse.
- 2026-05-05 — Adding optional schema columns (`events.intent`, `events.intentConfidence`, `triggers.intents`) is a `ALTER TABLE … ADD COLUMN IF NOT EXISTS` no-CHECK migration. Validation lives at the Zod boundary, not the SQL layer, so future label additions don't need a migration.
- 2026-05-05 — Importing `IntentSchema` into the handler input file (`createAutomation.ts`) requires the export to be re-stated — Zod enums can't be re-derived from `z.infer` types because they're runtime values. Cleanest pattern: `export const IntentSchema = z.enum([...])` in `db/schema.ts`, then `import { IntentSchema } from '../../db/schema.js'` wherever the input shape needs it.
- 2026-05-05 — When wiring a new optional gate into the `processCommentEvent` / `processDmEvent` keyword loop, place the gate check BETWEEN the keyword match and `result.matched += 1`. Why: the matched-counter should reflect "automations that actually fire", and the gate is part of "fire". Reordering breaks the metric.

### Spec 017 / Phase 1.3 lessons (2026-05-05)

**Real post picker (Meta Graph media listing)**
- 2026-05-05 — Meta Graph `GET /{igUserId}/media` returns `paging: { cursors: { after }, next: <full-url> }`. Use the cursor (just the opaque string), not the full URL — our route handler reconstructs the URL itself, and storing the full URL ties us to Meta's URL shape. Treat `paging.cursors.after` as the "give me more" token; treat `paging.next` as the "there is more" boolean.
- 2026-05-05 — Cache-injection seam pattern for handlers that hit external APIs: handler signature `fn(ctx, input, opts: { cache?: MediaCache } = {})` with a `NOOP_CACHE` default. Phase 2 wires a real Redis cache without touching call sites. Tests can pass a stub cache (vi.fn) to assert hit-vs-miss paths without spinning up Redis.
- 2026-05-05 — Server-side image proxying for IG media is not needed in v1 — Meta's CDN URLs are publicly fetchable for the lifetime of the post, and the picker UI is dashboard-internal (logged-in tenants only). Adding a proxy now is premature optimisation. Phase 2 may proxy if we hit referrer-block issues.
- 2026-05-05 — Resetting dependent state on parent-state change: when the IG account `<select>` changes, post IDs from the previous account become semantically meaningless. The form clears `selectedPostIds` in the `onChange` handler. Without this, a tenant could inadvertently tie an automation to post IDs from a different account — the worker would silently never match.
- 2026-05-05 — `<img>` in Next.js with external Meta CDN URLs needs `// eslint-disable-next-line @next/next/no-img-element` (we're not using `next/image` because the Meta URL set isn't on the configured remote-pattern list, and adding it for ephemeral picker thumbnails is overkill).
- 2026-05-05 — When a post-picker modal mounts but the dependent IG account isn't selected yet, render a disabled trigger button (`disabled={igAccountId === ''}`) — don't render an empty-state error. The form can still be submitted with no posts selected (= "all posts"), so the picker is genuinely optional.

### Spec 018 / Phase 1.4 lessons (2026-05-05)

**Story-reply automation (code-ready, App-Review-gated)**
- 2026-05-05 — Story replies arrive on the Meta `messages` webhook field with `messaging[].message.reply_to.story` set. They are NOT a separate webhook field. Tagging them in `parseWebhookEvents` is a 3-line check: `msg.message.reply_to?.story !== undefined → kind = 'storyReply'`. Reactions still take precedence (`msg.reaction` first), so a reaction TO a story remains `'messageReaction'`, not `'storyReply'`.
- 2026-05-05 — Build-and-ship the handler even when production traffic is gated. The dispatcher branch + `processStoryReplyEvent` cost ~150 LOC, run only against synthetic test events, and drop a 1-line UI flip + 1-line `WEBHOOK_FIELDS` change between us and turn-on day. Doing it later when the unblocker arrives means re-paging into the multi-tenancy / ctx / repo / dedupe patterns; doing it now keeps the patterns fresh and the diff small.
- 2026-05-05 — `void storyId;` is the cleanest TypeScript idiom for "I'm parsing this field but not using it yet" — silences `noUnusedVariables` without forcing a comment hack. When per-story scoping ships in a follow-up, the variable becomes live.
- 2026-05-05 — UI badging pattern for "code is ready, permission pending": keep the radio disabled, add a `<span>Beta</span>` chip and a body line citing the exact Meta permission needed (`instagram_manage_messages`) so an operator browsing the form knows the unblocker. Avoid the temptation to enable the radio with a "won't fire" warning — tenants will create automations expecting them to fire.

### Spec 019 / Phase 2.2 lessons (2026-05-05)

**AI usage dashboard**
- 2026-05-05 — `Intl.NumberFormat('en-IN', { ... })` returns Indian-locale grouping (1,00,000 not 100,000) with English digits. Use this for any tenant-facing number (cost, tokens, lead counts) — Hindi grouping is the spoken-language norm in India even when the numeral system is English. Hard-coded "en-US" or default-locale formatting reads as foreign. Pair with `minimumFractionDigits: 2` for currency.
- 2026-05-05 — Lazy-create-on-write, return-synthetic-on-read is the right pattern for "monthly bucket" rows like `aiUsage`. The classifier / generator handlers create the row when AI is actually used; the read-side dashboard handler returns a synthetic zero-row when none exists yet. Avoid creating rows just to display "₹0 used" on the dashboard — it pollutes the table with idle-tenant rows.
- 2026-05-05 — `pctUsed` clamping (Math.max(0, Math.min(999, raw))) defends against bad state. If a buggy `$inc` adds negative or absurd values, we render "999% of cap" instead of "1500% of cap" or "-50%" — clearly broken but not visually shattering.
- 2026-05-05 — Dashboard summary cards take pre-fetched data via Server Component props. Don't have the card fetch its own data — that creates N+1 fetches. The dashboard page already runs `Promise.all` over its handlers; adding the summary call there is one extra parallel branch with no latency cost.
- 2026-05-05 — Migration runner env-isolation pattern: a CLI admin tool (`scripts/db-migrate.ts`) shouldn't depend on the full app env validator. Read `process.env.STRICTDB_URI` directly with a clear `process.exit(1)` if missing. Keep `loadEnv()` for the app's runtime boundary; don't leak it into operator tools that have different env needs.
- 2026-05-05 — `node --env-file-if-exists=.env` (Node 20+) is the cleanest way to load `.env` for CLI scripts without adding `dotenv` as a dependency. The `-if-exists` variant is silent when `.env` is absent (CI / Docker), erroring nowhere. Pair with the env-isolation pattern above so partial `.env` doesn't break admin tools.

### Spec 020 / Phase 2.3 lessons (2026-05-05)

**Pagination**
- 2026-05-05 — `Paginated<T>` shape: `{ items, total, page, pageSize, hasNext }`. Pages are 1-indexed in the public API (URL `?page=1`); `skip = (page - 1) * pageSize` happens inside the helper. Returning `total` separately is essential for "Page X of Y" UI — without it, the client has to walk pages to know when to stop.
- 2026-05-05 — Run `repo.queryMany` + `repo.count` in parallel via `Promise.all` (Critical Rule #8). The two queries hit the same indexed columns; running them serially doubles the latency on every page load.
- 2026-05-05 — Backwards-compatible API responses: a list endpoint that previously returned `{ leads: [...] }` shouldn't break tests when paginated. Keep the array key flat and add pagination meta alongside: `{ leads: [...], page, pageSize, total, hasNext }`. Existing E2E tests that assert `body.leads[0]` keep passing.
- 2026-05-05 — `exactOptionalPropertyTypes: true` rejects passing `undefined` for an optional field. Build the input object incrementally with `if (opts.page !== undefined) paginateOpts.page = opts.page` rather than passing `{ page: opts.page }` (which forces `page: number | undefined`). Annoying but well-understood; the alternative is to weaken the helper's signature, which loses type safety.
- 2026-05-05 — Server Component pagination via URL `?page=N` (not client-side state) means refresh / back-button / share-link Just Work. Don't reach for `useState` + `fetch` for pagination on Server-rendered list pages — the URL is the source of truth.
- 2026-05-05 — CSV export needs all matching rows in one shot, not pagination. Dual-purpose handlers stay clean if you document a back-compat `limit` shim that the export route uses (`pageSize: 5000, page: 1` ≈ "give me everything"). Don't fork into `listLeads` + `listAllLeadsForCsv` — one handler, two callers, one paged interface.

