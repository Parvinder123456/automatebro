# Getting started — picking up work on any machine

You sat down at a laptop (office, personal, fresh clone, whatever).
This is the canonical 5-minute on-ramp to know exactly **where the
project is, what's shipped, and what to work on next**. Run it before
typing your first feature commit.

> Companion docs:
> - `CLAUDE.md` — rules + per-spec lessons (read by Claude every session)
> - `docs/TODO_BUILD.md` — what's shipped vs pending
> - `docs/branch.md` — how to push a feature branch to master
> - `docs/engineering-plan.md` — v1 contract (locked)
> - `docs/specs/NNN-*.md` — per-feature design docs

---

## Scenario A — fresh clone (new machine, never had this repo)

```bash
git clone https://github.com/Parvinder123456/automatebro.git
cd automatebro

# Install dependencies (uses pnpm; project pins via packageManager field)
pnpm install

# Copy env template and fill in your values
cp .env.example .env
# Open .env in your editor. You need at minimum:
#   STRICTDB_URI=postgresql://...           (Supabase connection string)
#   SUPABASE_URL=https://....supabase.co
#   SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
#   META_APP_ID=...
#   META_APP_SECRET=...                     (Facebook App Secret)
#   META_IG_APP_SECRET=...                  (Instagram App Secret — different)
#   META_TOKEN_KEY=...                      (base64 32 random bytes)
#   META_WEBHOOK_VERIFY_TOKEN=...
#   REDIS_URL=rediss://...                  (Upstash)
#   OPENAI_API_KEY=...                      (optional — AI replies fall back if absent)

# Apply any pending DB migrations
pnpm db:migrate

# Verify the smoke gate passes locally
pnpm smoke
# Expected: typecheck OK · lint OK · ~125 unit tests pass · next build succeeds
```

Now skip to **Scenario C — orient yourself** below.

---

## Scenario B — existing clone, returning after time away

```bash
# Make sure you're on master and pull the latest
git checkout master
git pull origin master

# Reinstall in case dependencies changed
pnpm install

# Apply any new migrations (idempotent — safe to re-run)
pnpm db:migrate:check           # tells you if any are pending without applying
pnpm db:migrate                 # apply pending migrations if there are any

# Run the smoke gate to confirm everything still works on this machine
pnpm smoke
```

If `pnpm install` complains about lockfile drift, run `pnpm install --frozen-lockfile=false`
once, then commit the lockfile delta on a separate branch.

If smoke fails, **don't start new work yet** — figure out why first. Common
causes: Node version mismatch (project requires Node 20+), missing env var,
or local DB out of sync.

Now go to **Scenario C**.

---

## Scenario C — orient yourself ("what's the state of the project?")

Even on a synced master, you still need to know what's shipped, what's
in flight on someone else's branch, and what to pick up next. Three
commands in this order:

```bash
# 1. What's the current master commit + the last 10 things that landed?
git log --oneline -10

# 2. What's shipped vs pending? (Single source of truth for status.)
cat docs/TODO_BUILD.md | head -80

# 3. Are there any other unmerged branches with work?
git branch -r --no-merged origin/master
```

That's all you need to know:
- The git log gives you the **literal current state** of master.
- TODO_BUILD.md gives you the **planned next item** + which Phase you're in.
- The unmerged branches tell you if **someone else is mid-work** on something.

If TODO_BUILD.md disagrees with what `git log` shows, **trust git** and update
TODO_BUILD.md as part of your next commit. The doc drifts; the code doesn't.

---

## Scenario D — kick off a Claude session with full context

Start your chat with a one-liner like:

> "Read `docs/TODO_BUILD.md` and `git log --oneline -10`, then propose the next
> Phase to build. Don't start coding yet."

Claude (per `CLAUDE.md`'s onboarding section) auto-reads CLAUDE.md and is
already trained on the four-doc structure. The one-liner above ensures it
also reads TODO_BUILD.md before proposing work — without that, Claude knows
the rules but not the state.

Claude will respond with something like:
> "Master is at `<short-sha>`, last shipped: <feature>. Next unblocked is
> Phase X.Y. Want me to spec + build it, or pick something else?"

If you say "yes go", Claude will: branch first, write a spec doc, build,
smoke, commit, merge per `docs/branch.md`. Per CLAUDE.md §10 it will never
write directly to master.

---

## Scenario E — start a new feature

```bash
# From master (sync'd per Scenario B above):
git checkout -b feat/<short-name>

# Edit code. Commit as you go.
git add <files>
git commit -m "feat(spec-NNN): one-line summary"

# Before merging, run the smoke gate (mandatory per CLAUDE.md §12.8)
pnpm smoke

# Push the branch
git push -u origin feat/<short-name>

# Merge — see docs/branch.md for both PR and fast-forward paths
```

---

## Common gotchas

### "I'm on a different OS — Windows + macOS — and migrations show as 'content has changed'"
The migration runner normalises line endings before hashing (`.replace(/\r\n/g, '\n')` in
`scripts/db-migrate.ts`). If you still see drift, check `.gitattributes` enforces `eol=lf`
for `*.sql` files.

### "pnpm db:migrate fails with `META_IG_APP_SECRET is required`"
Already fixed in spec 1a5254b. Pull latest master. The runner now reads `STRICTDB_URI`
directly without invoking the full env validator. Older clones may still have the broken
script — `git pull` solves it.

### "I edited files on master by accident"
The `check-branch.sh` hook should have blocked the commit. If it didn't:

```bash
git stash                                # save your changes
git reset --hard origin/master           # reset master to remote
git checkout -b feat/<short-name>        # create the branch you should have made first
git stash pop                            # restore your changes onto the branch
```

### "I have a stale feature branch from weeks ago — should I rebase or restart?"
Check the divergence:

```bash
git log --oneline master..feat/<branch>   # commits unique to your branch
git log --oneline feat/<branch>..master   # commits master has that you don't
```

If your branch is < 5 commits and master moved < 20 commits → rebase. Anything
larger → consider restarting. The cost of conflict resolution scales
super-linearly.

### "I switched laptops and want my old WIP back"
WIP that's only in the working tree (not committed) doesn't sync. You have to
commit-and-push first on the source machine, even if the work is incomplete:

```bash
# On the source machine:
git add -A
git commit -m "wip: <description>"
git push -u origin feat/<short-name>

# On the destination machine:
git fetch origin
git checkout feat/<short-name>
```

`git stash` is **machine-local** — it does not sync.

---

## The five-minute test: are you set up correctly?

Before you start a feature, confirm all five of these:

1. ✅ `git branch --show-current` outputs `master`
2. ✅ `git status` is clean (no uncommitted changes)
3. ✅ `git log -1 --oneline` matches the latest commit on GitHub
4. ✅ `pnpm db:migrate:check` returns "all migrations applied"
5. ✅ `pnpm smoke` returns green

If any fail, fix them before opening a feature branch. Setup problems get 10×
harder to debug once you're 30 minutes into a feature.
