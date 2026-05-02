#!/usr/bin/env tsx
/**
 * Spec 003 — SQL migration runner.
 *
 * Applies pending migrations from scripts/migrations/NNN-*.sql against
 * the database identified by STRICTDB_URI. Records each apply in
 * public._migrations (version + sha256 checksum). Refuses to re-apply
 * a migration whose checksum has changed.
 *
 * Usage:
 *   pnpm db:migrate          # apply pending
 *   pnpm db:migrate --check  # exit 1 if pending exist (CI gate)
 *
 * EXCEPTION to CLAUDE.md Rule #3 ("StrictDB only — no native pg"):
 * this is the one place we use `pg` directly because StrictDB does not
 * expose DDL operations. Documented in CLAUDE.md "Lessons learned".
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { loadEnv } from '../packages/shared/src/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(__dirname, 'migrations');

interface AppliedRow {
  version: string;
  checksum: string;
  applied_at: Date;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function listFiles(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => /^\d{3}-.+\.sql$/.test(f))
    .sort();
}

function fileVersion(filename: string): string {
  const match = filename.match(/^(\d{3})-/);
  if (match === null) throw new Error(`Bad migration filename: ${filename}`);
  return match[1] ?? '';
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._migrations (
      version    TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);
}

async function listApplied(client: Client): Promise<AppliedRow[]> {
  const result = await client.query<AppliedRow>(
    'SELECT version, checksum, applied_at FROM public._migrations ORDER BY version',
  );
  return result.rows;
}

interface MigrateResult {
  applied: string[];
  pending: string[];
  errors: string[];
}

async function migrate(checkOnly: boolean): Promise<MigrateResult> {
  const env = loadEnv();
  const client = new Client({ connectionString: env.STRICTDB_URI });
  await client.connect();

  const result: MigrateResult = { applied: [], pending: [], errors: [] };

  try {
    await ensureMigrationsTable(client);
    const applied = await listApplied(client);
    const onDisk = listFiles();

    for (const file of onDisk) {
      const version = fileVersion(file);
      const path = join(MIG_DIR, file);
      const content = readFileSync(path, 'utf8');
      const checksum = sha256(content);
      const prev = applied.find((a) => a.version === version);

      if (prev !== undefined) {
        if (prev.checksum !== checksum) {
          const expected = prev.checksum.slice(0, 12);
          const got = checksum.slice(0, 12);
          result.errors.push(
            `Migration ${version} (${file}) content has changed since apply (expected ${expected}…, got ${got}…). Migrations are forward-only. Write a new migration to undo.`,
          );
        }
        continue;
      }

      result.pending.push(file);

      if (checkOnly) continue;

      await client.query('BEGIN');
      try {
        await client.query(content);
        await client.query(
          'INSERT INTO public._migrations (version, checksum, applied_at) VALUES ($1, $2, now())',
          [version, checksum],
        );
        await client.query('COMMIT');
        result.applied.push(file);
        console.log(`✓ applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Failed to apply ${file}: ${message}`);
        throw err;
      }
    }
  } finally {
    await client.end();
  }

  return result;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');

  let result: MigrateResult;
  try {
    result = await migrate(checkOnly);
  } catch (err) {
    console.error('Migration runner failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (result.errors.length > 0) {
    for (const e of result.errors) console.error(`✗ ${e}`);
    process.exit(1);
  }

  if (checkOnly) {
    if (result.pending.length > 0) {
      console.error(`✗ ${result.pending.length} pending migration(s):`);
      for (const f of result.pending) console.error(`    ${f}`);
      process.exit(1);
    }
    console.log('✓ all migrations applied');
    process.exit(0);
  }

  if (result.applied.length === 0) {
    console.log('✓ no migrations to apply (already up to date)');
  } else {
    console.log(`✓ applied ${result.applied.length} migration(s)`);
  }
  process.exit(0);
}

main();
