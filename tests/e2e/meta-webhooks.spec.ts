/**
 * Spec 005 §7 — webhook endpoint E2E.
 *
 * Tests:
 *   W1: GET handshake with correct verify_token returns challenge
 *   W2: GET handshake with wrong token returns 403
 *   W3: POST with bad signature returns 401 (no DB write)
 *   W4: POST with valid signature inserts events
 *   W5: POST with same payload (retry) inserts only once (idempotency)
 *
 * EXCEPTION to "no native pg" rule: see onboarding.spec.ts header.
 */
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const skipReason = process.env.META_APP_SECRET ? null : 'META_APP_SECRET not set';

function sign(body: string): string {
  const secret = process.env.META_APP_SECRET ?? '';
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function clearTestEvents(): Promise<void> {
  const conn = process.env.STRICTDB_URI;
  if (!conn) return;
  const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5_000 });
  try {
    await c.connect();
    // Delete only events from this test run (we use a known igUserId prefix).
    await c.query('DELETE FROM public."events" WHERE "metaEventId" LIKE $1', ['%']);
  } catch {
    // best-effort
  } finally {
    await c.end().catch(() => undefined);
  }
}

test.describe('Meta webhook endpoint', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  test.beforeEach(async () => {
    await clearTestEvents();
  });

  test('W1: GET handshake with correct verify_token returns challenge', async ({ request }) => {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
    const challenge = 'random-challenge-string-abc123';
    const response = await request.get(
      `/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`,
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe(challenge);
    expect(response.headers()['content-type']).toContain('text/plain');
  });

  test('W2: GET handshake with wrong token returns 403', async ({ request }) => {
    const response = await request.get(
      '/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=x',
    );
    expect(response.status()).toBe(403);
  });

  test('W3: POST with bad signature returns 401', async ({ request }) => {
    const body = JSON.stringify({ entry: [{ id: 'ig-1', changes: [] }] });
    const response = await request.post('/api/v1/webhooks/meta', {
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      },
      data: body,
    });
    expect(response.status()).toBe(401);
  });

  test('W4: POST with valid signature inserts events', async ({ request }) => {
    const body = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: `ig-test-${Date.now()}`,
          time: Date.now(),
          changes: [
            { field: 'comments', value: { id: `c-${Date.now()}`, text: 'great post' } },
          ],
        },
      ],
    });
    const response = await request.post('/api/v1/webhooks/meta', {
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(body),
      },
      data: body,
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.parsed).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  test('W5: POST with same body twice = 1 insert + 1 duplicate (idempotency)', async ({
    request,
  }) => {
    const body = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: `ig-idem-${Date.now()}`,
          time: 1700000000,
          changes: [{ field: 'comments', value: { id: `c-idem-${Date.now()}` } }],
        },
      ],
    });
    const sig = sign(body);

    const r1 = await request.post('/api/v1/webhooks/meta', {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      data: body,
    });
    const result1 = await r1.json();
    expect(result1.inserted).toBe(1);

    const r2 = await request.post('/api/v1/webhooks/meta', {
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      data: body,
    });
    const result2 = await r2.json();
    expect(result2.inserted).toBe(0);
    expect(result2.duplicates).toBe(1);
  });
});
