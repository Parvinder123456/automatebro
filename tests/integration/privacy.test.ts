/**
 * Spec 013 §5.1–§5.3 — privacy (export, delete) + ctx-deleted-tenant
 * integration tests.
 *
 * Gated by `hasInfra`. Each test seeds its own data via the
 * createTestTenant fixture and cleans up with the returned closer.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { buildCtx } from '@automatebro/shared/auth/ctx';
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { exportTenantData } from '@automatebro/shared/handlers/privacy/exportTenantData';
import { requestTenantDeletion } from '@automatebro/shared/handlers/privacy/requestTenantDeletion';
import { afterEach, describe, expect, it } from 'vitest';
import { type TestTenantFixture, createTestTenant } from './_fixtures/tenants.js';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function ctxFor(t: TestTenantFixture): Ctx {
  return {
    userId: t.userId,
    tenantId: t.tenantId,
    role: 'owner',
    email: t.email,
    tenantDeleted: false,
  };
}

async function seedIgAccount(tenantId: string): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.insertOne('igAccounts', {
    _id: id,
    tenantId,
    igUserId: `ig-${id.slice(0, 8)}`,
    igUsername: `priv_${id.slice(0, 8)}`,
    pageId: `page-${id.slice(0, 8)}`,
    pageName: 'Privacy Test',
    accessTokenCiphertext: randomBytes(32),
    accessTokenIv: randomBytes(12),
    accessTokenTag: randomBytes(16),
    tokenKeyVersion: 1,
    scopes: ['instagram_basic'],
    connectedAt: new Date(),
  } as never);
  return id;
}

async function seedLead(tenantId: string, igAccountId: string): Promise<void> {
  const db = await getDb();
  const id = randomUUID();
  await db.insertOne('leads', {
    _id: id,
    tenantId,
    igAccountId,
    igUserId: `psid-${id.slice(0, 8)}`,
    igUsername: null,
    email: `${id.slice(0, 8)}@example.test`,
    phone: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    tags: [],
    attributedAutomationId: null,
  } as never);
}

describe.skipIf(!hasInfra)('exportTenantData (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  it('P1: exports the tenant row plus all tenant-scoped collections', async () => {
    const t = await createTestTenant('priv-p1');
    cleanup.push(t.cleanup);
    const igId = await seedIgAccount(t.tenantId);
    await seedLead(t.tenantId, igId);

    const data = await exportTenantData(ctxFor(t));

    expect(data.tenant).not.toBeNull();
    expect(data.tenant?._id).toBe(t.tenantId);
    expect(data.igAccounts).toHaveLength(1);
    expect(data.leads).toHaveLength(1);
    expect(data.schemaVersion).toBe(1);
  });

  it('P2: redacts encrypted token bytes on igAccount rows', async () => {
    const t = await createTestTenant('priv-p2');
    cleanup.push(t.cleanup);
    await seedIgAccount(t.tenantId);

    const data = await exportTenantData(ctxFor(t));

    expect(data.igAccounts[0]?.accessTokenCiphertext).toBeNull();
    expect(data.igAccounts[0]?.accessTokenIv).toBeNull();
    expect(data.igAccounts[0]?.accessTokenTag).toBeNull();
    expect(data.igAccounts[0]?.redacted).toBe(true);
  });

  it('P3: tenant A export does NOT contain tenant B data', async () => {
    const tA = await createTestTenant('priv-p3-a');
    cleanup.push(tA.cleanup);
    const tB = await createTestTenant('priv-p3-b');
    cleanup.push(tB.cleanup);

    const igA = await seedIgAccount(tA.tenantId);
    const igB = await seedIgAccount(tB.tenantId);
    await seedLead(tA.tenantId, igA);
    await seedLead(tB.tenantId, igB);

    const exportA = await exportTenantData(ctxFor(tA));

    expect(exportA.igAccounts.map((a) => a._id)).toContain(igA);
    expect(exportA.igAccounts.map((a) => a._id)).not.toContain(igB);
    for (const lead of exportA.leads) expect(lead.tenantId).toBe(tA.tenantId);
  });
});

describe.skipIf(!hasInfra)('requestTenantDeletion (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  it('D1: sets deletedAt + deletionRequestedAt on the tenants row', async () => {
    const t = await createTestTenant('priv-d1');
    cleanup.push(t.cleanup);

    const result = await requestTenantDeletion(ctxFor(t));

    expect(result.tenantId).toBe(t.tenantId);
    expect(result.alreadyDeleted).toBe(false);

    const db = await getDb();
    const row = await db.queryOne<{ deletedAt: Date | null; deletionRequestedAt: Date | null }>(
      'tenants',
      { _id: t.tenantId } as never,
    );
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletionRequestedAt).not.toBeNull();
  });

  it('D2: disconnects every igAccount belonging to the tenant', async () => {
    const t = await createTestTenant('priv-d2');
    cleanup.push(t.cleanup);
    const igId = await seedIgAccount(t.tenantId);

    await requestTenantDeletion(ctxFor(t));

    const db = await getDb();
    const ig = await db.queryOne<{ disconnectedAt: Date | null }>('igAccounts', {
      _id: igId,
    } as never);
    expect(ig?.disconnectedAt).not.toBeNull();
  });

  it('D3: idempotent — second call returns alreadyDeleted=true and preserves request time', async () => {
    const t = await createTestTenant('priv-d3');
    cleanup.push(t.cleanup);

    const first = await requestTenantDeletion(ctxFor(t));
    // Small delay so any second-call timestamp would be visibly different.
    await new Promise((r) => setTimeout(r, 5));
    const second = await requestTenantDeletion(ctxFor(t));

    expect(second.alreadyDeleted).toBe(true);
    expect(second.deletionRequestedAt.getTime()).toBe(first.deletionRequestedAt.getTime());
  });

  it('D4: tenant A deletion does NOT affect tenant B', async () => {
    const tA = await createTestTenant('priv-d4-a');
    cleanup.push(tA.cleanup);
    const tB = await createTestTenant('priv-d4-b');
    cleanup.push(tB.cleanup);

    await requestTenantDeletion(ctxFor(tA));

    const db = await getDb();
    const rowB = await db.queryOne<{ deletedAt: Date | null }>('tenants', {
      _id: tB.tenantId,
    } as never);
    expect(rowB?.deletedAt ?? null).toBeNull();
  });
});

describe.skipIf(!hasInfra)('buildCtx + soft-deleted tenant (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  it('CD1: tenantUsers row + deletedAt → ctx.tenantId is null AND tenantDeleted is true', async () => {
    const t = await createTestTenant('priv-cd1');
    cleanup.push(t.cleanup);
    await requestTenantDeletion(ctxFor(t));

    const db = await getDb();
    const ctx = await buildCtx({ id: t.userId, email: t.email, user_metadata: null }, db);

    expect(ctx.tenantId).toBeNull();
    expect(ctx.role).toBeNull();
    expect(ctx.tenantDeleted).toBe(true);
    // Onboarding-state users have tenantDeleted=false; deleted-tenant
    // users have tenantDeleted=true. The (app) layout uses this flag
    // to redirect deleted users to /deleted instead of /onboarding.
  });
});
