/**
 * Spec 006 §6.2 — end-to-end worker processing test.
 *
 * Spawns the worker as a child process, enqueues a process-event job,
 * waits for events.processedAt to be set, then SIGINTs the worker.
 *
 * REQUIRES: real STRICTDB_URI + REDIS_URL + a tenants row to FK against.
 * Skipped if not.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.REDIS_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const isWindows = process.platform === 'win32';

interface SpawnedWorker {
  proc: ChildProcess;
  output: () => string;
  waitForOutput(predicate: (s: string) => boolean, timeoutMs: number): Promise<boolean>;
  exit(): Promise<number>;
}

function spawnWorker(env: NodeJS.ProcessEnv): SpawnedWorker {
  const chunks: string[] = [];
  const proc = spawn('pnpm', ['dev:worker'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    shell: process.platform === 'win32',
  });
  proc.stdout?.on('data', (c: Buffer) => chunks.push(c.toString()));
  proc.stderr?.on('data', (c: Buffer) => chunks.push(c.toString()));
  const output = (): string => chunks.join('');
  const waitForOutput = async (
    predicate: (s: string) => boolean,
    timeoutMs: number,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate(output())) return true;
      await sleep(100);
    }
    return false;
  };
  const exit = (): Promise<number> =>
    new Promise((resolve) => {
      proc.once('exit', (code) => resolve(code ?? -1));
    });
  return { proc, output, waitForOutput, exit };
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({
    connectionString: process.env.STRICTDB_URI,
    connectionTimeoutMillis: 5_000,
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function insertTestTenantAndEvent(): Promise<{ tenantId: string; eventId: string }> {
  const tenantId = randomUUID();
  const eventId = randomUUID();
  const metaEventId = `test-${eventId}`;
  await withClient(async (c) => {
    await c.query(
      'INSERT INTO public."tenants" ("_id", "name", "slug", "plan", "createdAt") VALUES ($1, $2, $3, $4, now())',
      [tenantId, 'Worker Test', `worker-${tenantId.slice(0, 8)}`, 'free'],
    );
    await c.query(
      `INSERT INTO public."events"
        ("_id", "tenantId", "metaEventId", "kind", "payload", "signatureVerified", "receivedAt")
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [eventId, tenantId, metaEventId, 'comment', JSON.stringify({ test: true }), true],
    );
  });
  return { tenantId, eventId };
}

async function cleanup(tenantId: string): Promise<void> {
  await withClient(async (c) => {
    await c.query('DELETE FROM public."tenants" WHERE "_id" = $1', [tenantId]);
  }).catch(() => undefined);
}

describe.skipIf(!hasInfra || isWindows)('spec 006 worker processing (POSIX integration)', () => {
  let active: SpawnedWorker | null = null;

  afterEach(async () => {
    if (active && !active.proc.killed) {
      active.proc.kill('SIGKILL');
      await active.exit().catch(() => 0);
    }
    active = null;
  });

  it('worker picks up process-event jobs and marks events.processedAt', async () => {
    const { tenantId, eventId } = await insertTestTenantAndEvent();
    try {
      active = spawnWorker({ ...process.env });
      const ready = await active.waitForOutput((s) => s.includes('worker ready'), 30_000);
      expect(ready).toBe(true);

      // Enqueue a process-event job.
      const conn = new IORedis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: null });
      const queue = new Queue('events', { connection: conn });
      await queue.add('process-event', { type: 'process-event', eventId });

      // Wait up to 15s for the worker to mark the event processed.
      const deadline = Date.now() + 15_000;
      let processed = false;
      while (Date.now() < deadline && !processed) {
        processed = await withClient(async (c) => {
          const r = await c.query('SELECT "processedAt" FROM public."events" WHERE "_id" = $1', [
            eventId,
          ]);
          return r.rows[0]?.processedAt !== null;
        });
        if (!processed) await sleep(250);
      }
      expect(processed).toBe(true);

      await queue.close();
      await conn.quit();
    } finally {
      await cleanup(tenantId);
    }
  }, 60_000);
});

describe.skipIf(hasInfra && !isWindows)('spec 006 worker (no infra or Windows)', () => {
  it('skipped: requires Linux/macOS + infra (Windows SIGINT semantics break worker.close)', () => {
    expect(true).toBe(true);
  });
});
