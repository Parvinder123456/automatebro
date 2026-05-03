/**
 * Spec 011 §7 — listSends + countSendsLast24h integration tests.
 *
 * Gated by `hasInfra`. Inserts test sends rows directly via repo and
 * exercises the new handlers introduced in spec 011 step 3.
 */
import { randomUUID } from 'node:crypto';
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { countSendsLast24h } from '@automatebro/shared/handlers/sends/countSendsLast24h';
import { listSends } from '@automatebro/shared/handlers/sends/listSends';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestTenantFixture, createTestTenant } from './_fixtures/tenants.js';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function ctxFor(t: TestTenantFixture): Ctx {
  return { userId: t.userId, tenantId: t.tenantId, role: 'owner', email: t.email };
}

interface SeedSendOpts {
  status: 'queued' | 'sent' | 'failed' | 'rateLimited' | 'outsideWindow';
  queuedAt: Date;
  igAccountId?: string;
  automationId?: string | null;
}

async function seedSend(tenantId: string, opts: SeedSendOpts): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.insertOne('sends', {
    _id: id,
    tenantId,
    igAccountId: opts.igAccountId ?? randomUUID(),
    automationId: opts.automationId ?? null,
    recipientPsid: `psid-${id.slice(0, 8)}`,
    kind: 'dm',
    content: `test send ${id.slice(0, 8)}`,
    aiGenerated: false,
    status: opts.status,
    metaMessageId: null,
    errorCode: null,
    errorMessage: null,
    attempt: 0,
    queuedAt: opts.queuedAt,
    sentAt: opts.status === 'sent' ? opts.queuedAt : null,
    failedAt: opts.status === 'failed' ? opts.queuedAt : null,
  } as never);
  return id;
}

describe.skipIf(!hasInfra)('listSends + countSendsLast24h (integration)', () => {
  let tenantA: TestTenantFixture;
  let tenantB: TestTenantFixture;

  beforeAll(async () => {
    tenantA = await createTestTenant('sendsA');
    tenantB = await createTestTenant('sendsB');
  }, 30_000);

  afterAll(async () => {
    await tenantA?.cleanup();
    await tenantB?.cleanup();
  }, 30_000);

  it('S1: listSends returns rows for the tenant, sorted queuedAt DESC', async () => {
    const ctx = ctxFor(tenantA);
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    const sentId = await seedSend(tenantA.tenantId, { status: 'sent', queuedAt: earlier });
    const queuedId = await seedSend(tenantA.tenantId, { status: 'queued', queuedAt: now });

    const rows = await listSends(ctx, {});
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // newest first — queuedId before sentId
    const queuedIdx = rows.findIndex((r) => r._id === queuedId);
    const sentIdx = rows.findIndex((r) => r._id === sentId);
    expect(queuedIdx).toBeGreaterThanOrEqual(0);
    expect(sentIdx).toBeGreaterThan(queuedIdx);
  });

  it('S2: listSends ?status filter narrows results', async () => {
    const ctx = ctxFor(tenantA);
    const failedRows = await listSends(ctx, { status: 'failed' });
    for (const r of failedRows) {
      expect(r.status).toBe('failed');
    }
    // Sanity: at least one tenant-A failed row in the result if we seed one.
    await seedSend(tenantA.tenantId, { status: 'failed', queuedAt: new Date() });
    const failedAfter = await listSends(ctx, { status: 'failed' });
    expect(failedAfter.length).toBeGreaterThanOrEqual(1);
  });

  it('S3: tenant B cannot see tenant A sends', async () => {
    await seedSend(tenantA.tenantId, { status: 'sent', queuedAt: new Date() });
    const ctxB = ctxFor(tenantB);
    const rows = await listSends(ctxB, {});
    // tenantB has its own seeds but never sees tenantA — assert by tenantId
    for (const r of rows) {
      expect(r.tenantId).toBe(tenantB.tenantId);
    }
  });

  it('S4: countSendsLast24h returns only rows from the last 24 hours', async () => {
    const ctx = ctxFor(tenantA);
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await seedSend(tenantA.tenantId, { status: 'sent', queuedAt: now });
    await seedSend(tenantA.tenantId, { status: 'sent', queuedAt: twoDaysAgo });

    const recent = await countSendsLast24h(ctx);
    expect(recent).toBeGreaterThanOrEqual(1);

    // Strict assertion: count - rows-older-than-24h should equal recent.
    const all = await listSends(ctx, { limit: 5000 });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentInAll = all.filter((r) => new Date(r.queuedAt) >= cutoff).length;
    expect(recent).toBe(recentInAll);
  });
});

describe.skipIf(hasInfra)('listSends (no infra)', () => {
  it('skipped: STRICTDB_URI / SUPABASE_* not set', () => {
    expect(true).toBe(true);
  });
});
