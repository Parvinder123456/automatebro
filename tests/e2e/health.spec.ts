/**
 * Spec 001 §11.3 — health endpoint E2E test.
 *
 * E1: GET /api/v1/health returns 200 with the documented JSON shape
 *     when database + Redis are both reachable.
 *
 * Per CLAUDE.md Rule #4 (Testing — Explicit Success Criteria), this
 * test makes the minimum 3 assertions: URL/status, response shape,
 * and data correctness. Plus a few extras for confidence.
 */
import { expect, test } from '@playwright/test';

test.describe('GET /api/v1/health', () => {
  test('E1: returns 200 + ok payload when DB and Redis are reachable', async ({ request }) => {
    const response = await request.get('/api/v1/health');

    // Assertion 1 — URL/status (CLAUDE.md Rule #4 minimum #1)
    expect(response.url()).toContain('/api/v1/health');
    expect(response.status()).toBe(200);

    // Assertion 2 — response shape (analog to "element visible" for an API)
    const body = (await response.json()) as {
      status: string;
      version: string;
      checks: {
        db: { ok: boolean; backend?: string; error?: string };
        redis: { ok: boolean; latencyMs?: number; error?: string };
      };
    };
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(body.checks).toBeDefined();
    expect(body.checks.db).toBeDefined();
    expect(body.checks.redis).toBeDefined();

    // Assertion 3 — data correctness (CLAUDE.md Rule #4 minimum #3)
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.db.backend).toBe('postgresql');
    expect(body.checks.redis.ok).toBe(true);
    expect(typeof body.checks.redis.latencyMs).toBe('number');
    expect(body.checks.redis.latencyMs).toBeLessThan(2000);

    // Assertion 4 — response headers (no caching of health)
    expect(response.headers()['cache-control']).toBe('no-store');

    // Assertion 5 — no error fields when ok
    expect(body.checks.db.error).toBeUndefined();
    expect(body.checks.redis.error).toBeUndefined();
  });

  test('E1b: response is JSON content-type', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.headers()['content-type']).toContain('application/json');
  });
});
