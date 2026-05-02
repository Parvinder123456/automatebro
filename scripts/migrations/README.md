# Database migrations

Forward-only SQL migrations applied via `pnpm db:migrate`.

## How to add a migration

1. Create `scripts/migrations/NNN-short-description.sql` where `NNN` is the
   next zero-padded integer (look at the highest existing).
2. Write idempotent SQL where possible: `CREATE TABLE IF NOT EXISTS`,
   `CREATE INDEX IF NOT EXISTS`, etc.
3. Run `pnpm db:migrate` against your dev Supabase project.
4. Commit the file.

## Rules

- **Forward-only.** Once a migration is applied to ANY environment (your
  dev project counts), never edit it. The runner records a checksum and
  refuses to proceed if the contents change. To "roll back", write a new
  migration that undoes the change.
- **One file per logical change.** Don't bundle table creation + seed
  data + index changes — keep migrations small so the apply log is
  readable.
- **Use SQL conventions:** `snake_case` columns, `_id` as PK column,
  `created_at` / `updated_at` for timestamps. The StrictDB adapter maps
  these to `camelCase` for app code.
- **No data migrations in v1.** If you need to backfill data, write a
  one-shot script in `scripts/queries/` and run via `pnpm db:query`.
  Migrations are schema-only for now.
- **Foreign keys cascade by default** for multi-tenant tables:
  `REFERENCES tenants(_id) ON DELETE CASCADE`.

## Checking state

```bash
pnpm db:migrate          # apply pending migrations
pnpm db:migrate --check  # exit 1 if pending exist (CI gate)
```

The runner stores apply records in `public._migrations` with columns
`version`, `checksum`, `applied_at`. Inspect via `pnpm db:query` once
that pattern is wired (or via Supabase SQL editor).
