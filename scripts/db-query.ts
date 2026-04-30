#!/usr/bin/env tsx
/**
 * Test Query Master — cc-mastery starter kit pattern.
 *
 * ALL ad-hoc / test / dev database queries go through this entry point
 * (per CLAUDE.md Critical Rule #3). New queries are added under
 * scripts/queries/<name>.ts and registered below.
 *
 * Usage:
 *   pnpm db:query <name> [args...]
 *   pnpm db:query:list
 *
 * Spec 001 ships with an empty registry. Subsequent specs add queries.
 */
import { closeDb, getDb } from '../packages/shared/src/db/client.js';

interface QueryModule {
  default: {
    name: string;
    description: string;
    run: (db: Awaited<ReturnType<typeof getDb>>, args: string[]) => Promise<void>;
  };
}

/**
 * Add new queries by registering them here:
 *   'find-expired-sessions': () => import('./queries/find-expired-sessions.js'),
 */
const queryRegistry: Record<string, () => Promise<QueryModule>> = {};

async function listQueries(): Promise<void> {
  const names = Object.keys(queryRegistry);
  if (names.length === 0) {
    console.log('No queries registered yet.');
    console.log('Add one under scripts/queries/<name>.ts and register it in scripts/db-query.ts.');
    return;
  }
  console.log('Available queries:');
  for (const name of names.sort()) {
    const loader = queryRegistry[name];
    if (!loader) continue;
    const mod = await loader();
    console.log(`  ${name.padEnd(30)} ${mod.default.description}`);
  }
}

async function runQuery(name: string, args: string[]): Promise<void> {
  const loader = queryRegistry[name];
  if (!loader) {
    console.error(`Unknown query: ${name}`);
    console.error('Run `pnpm db:query:list` to see available queries.');
    process.exitCode = 1;
    return;
  }
  const mod = await loader();
  const db = await getDb();
  await mod.default.run(db, args);
}

async function main(): Promise<void> {
  const [first, ...rest] = process.argv.slice(2);
  try {
    if (first === '--list' || first === undefined) {
      await listQueries();
      return;
    }
    await runQuery(first, rest);
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
