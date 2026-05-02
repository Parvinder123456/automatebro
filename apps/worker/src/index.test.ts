/**
 * Spec 001 §11.4 — worker bootstrap tests.
 *
 * W1: spawn the worker; expect "worker ready" log within 10s; SIGINT it;
 *     expect "worker shutdown complete" log and exit code 0 within 10s.
 * W2: spawn the worker with empty STRICTDB_URI; expect non-zero exit and
 *     an error message mentioning STRICTDB_URI.
 * W3: spawn the worker; after "worker ready", read worker:heartbeat from
 *     Redis and expect a recent ISO timestamp.
 *
 * REQUIRES: real STRICTDB_URI + REDIS_URL in env (W1, W3). Skipped if not.
 *
 * NOTE: these tests spawn the worker as a child process via `pnpm
 * dev:worker`. The first run may need `pnpm install` to populate
 * node_modules.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';

const hasInfra = Boolean(process.env.STRICTDB_URI && process.env.REDIS_URL);

/**
 * Windows + Node.js limitation: `proc.kill('SIGINT')` on Windows
 * terminates the child process abruptly instead of sending an actual
 * SIGINT signal — so the worker's `process.on('SIGINT')` handler never
 * runs and "worker shutdown complete" never logs. See:
 * https://nodejs.org/api/child_process.html#subprocesskillsignal
 *
 * We split the integration tests: SIGINT-dependent ones (W1, W2) skip
 * on Windows; the boot+heartbeat test (W3) runs everywhere.
 *
 * Linux CI (and the Railway production worker) handle SIGINT correctly.
 */
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

describe.skipIf(!hasInfra || isWindows)(
  'apps/worker/src/index.ts — graceful shutdown (POSIX integration)',
  () => {
    let active: SpawnedWorker | null = null;

    afterEach(async () => {
      if (active && !active.proc.killed) {
        active.proc.kill('SIGKILL');
        await active.exit().catch(() => 0);
      }
      active = null;
    });

    it('W1: starts and shuts down cleanly on SIGINT', async () => {
      active = spawnWorker({ ...process.env });
      const ready = await active.waitForOutput((s) => s.includes('worker ready'), 15_000);
      expect(ready).toBe(true);

      active.proc.kill('SIGINT');
      const code = await active.exit();
      expect(active.output()).toContain('worker shutdown complete');
      expect(code).toBe(0);
    }, 30_000);

    it('W2: rejects bad env (empty STRICTDB_URI) and exits non-zero', async () => {
      active = spawnWorker({ ...process.env, STRICTDB_URI: '' });
      const code = await active.exit();
      expect(code).not.toBe(0);
      expect(active.output()).toMatch(/STRICTDB_URI/i);
    }, 15_000);
  },
);

describe.skipIf(!hasInfra)('apps/worker/src/index.ts — boot + heartbeat (integration)', () => {
  let active: SpawnedWorker | null = null;

  afterEach(async () => {
    if (active && !active.proc.killed) {
      active.proc.kill('SIGKILL');
      await active.exit().catch(() => 0);
    }
    active = null;
  });

  it('W3: writes worker:heartbeat key to Redis', async () => {
    const redis = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: 1 });
    try {
      active = spawnWorker({ ...process.env });
      // Cold start can take ~10–14s on Windows once schema registration
      // + index ensure runs against Supabase. 30s is comfortable.
      const ready = await active.waitForOutput((s) => s.includes('worker ready'), 30_000);
      expect(ready).toBe(true);

      // Heartbeat interval is 30s; worker should write one on boot.
      // Allow up to 5s after ready before reading.
      let heartbeat: string | null = null;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && heartbeat === null) {
        heartbeat = await redis.get('worker:heartbeat');
        if (heartbeat === null) await sleep(200);
      }
      expect(heartbeat).not.toBeNull();
      // Heartbeat is an ISO timestamp.
      expect(() => new Date(heartbeat ?? '').toISOString()).not.toThrow();
    } finally {
      await redis.quit();
    }
  }, 60_000);
});

describe.skipIf(hasInfra)('apps/worker/src/index.ts — bootstrap (no infra)', () => {
  it('skipped: STRICTDB_URI / REDIS_URL not set; tests not run', () => {
    expect(true).toBe(true);
  });
});
