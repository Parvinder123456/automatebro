/**
 * Spec 003 §10.1 — migrations runner tests.
 *
 * Tests the runner indirectly by spawning `pnpm db:migrate` and
 * `pnpm db:migrate:check` as child processes. Avoids re-implementing
 * the runner's filesystem + DB orchestration in test code.
 */
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasInfra = Boolean(process.env.STRICTDB_URI);

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn('pnpm', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (c) => {
      stdout += c.toString();
    });
    proc.stderr?.on('data', (c) => {
      stderr += c.toString();
    });
    proc.on('exit', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}

describe.skipIf(!hasInfra)('migrations runner (integration)', () => {
  it('M1: pnpm db:migrate is idempotent (re-run is no-op)', async () => {
    // First run: applies anything pending OR is no-op if already up to date.
    const first = await run(['db:migrate']);
    expect(first.exitCode).toBe(0);

    // Second run: must be no-op.
    const second = await run(['db:migrate']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toMatch(/no migrations to apply|already up to date/i);
  }, 60_000);

  it('M2: pnpm db:migrate:check exits 0 when up-to-date', async () => {
    // Ensure all applied first.
    await run(['db:migrate']);

    const result = await run(['db:migrate:check']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/all migrations applied/i);
  }, 60_000);
});

describe.skipIf(hasInfra)('migrations (no infra)', () => {
  it('skipped: STRICTDB_URI not set', () => {
    expect(true).toBe(true);
  });
});
