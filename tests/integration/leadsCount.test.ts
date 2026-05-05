/**
 * Spec 011 §7 — countLeads integration test.
 *
 * Tiny suite: verifies the dashboard summary counter is tenant-scoped.
 * Gated by `hasInfra`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { countLeads } from '@automatebro/shared/handlers/leads/countLeads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    igUsername: `lc_${id.slice(0, 8)}`,
    pageId: `page-${id.slice(0, 8)}`,
    pageName: 'Lead Count Test',
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

describe.skipIf(!hasInfra)('countLeads (integration)', () => {
  let tenantA: TestTenantFixture;
  let tenantB: TestTenantFixture;

  beforeAll(async () => {
    tenantA = await createTestTenant('countA');
    tenantB = await createTestTenant('countB');
    const acctA = await seedIgAccount(tenantA.tenantId);
    const acctB = await seedIgAccount(tenantB.tenantId);
    await seedLead(tenantA.tenantId, acctA);
    await seedLead(tenantA.tenantId, acctA);
    await seedLead(tenantA.tenantId, acctA);
    await seedLead(tenantB.tenantId, acctB);
  }, 60_000);

  afterAll(async () => {
    await tenantA?.cleanup();
    await tenantB?.cleanup();
  }, 30_000);

  it('CL1: tenant-scoped count of leads', async () => {
    const a = await countLeads(ctxFor(tenantA));
    const b = await countLeads(ctxFor(tenantB));
    expect(a).toBe(3);
    expect(b).toBe(1);
  });
});

describe.skipIf(hasInfra)('countLeads (no infra)', () => {
  it('skipped: STRICTDB_URI / SUPABASE_* not set', () => {
    expect(true).toBe(true);
  });
});
