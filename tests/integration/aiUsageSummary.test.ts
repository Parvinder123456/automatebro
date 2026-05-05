/**
 * Spec 019 / Phase 2.2 — getAiUsageSummary integration tests.
 *
 * Gated on hasInfra. Seeds aiUsage rows directly via getDb() (the
 * handler itself reads via repo, so seeding can be a one-shot direct
 * insert — repo would auto-merge tenantId at write time which is the
 * same behaviour we want).
 */
import { randomUUID } from 'node:crypto';
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { getAiUsageSummary } from '@automatebro/shared/handlers/aiUsage/getAiUsageSummary';
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

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function seedAiUsage(
  tenantId: string,
  month: string,
  costInr: number,
  cap = 50_000,
): Promise<void> {
  const db = await getDb();
  await db.insertOne('aiUsage', {
    _id: randomUUID(),
    tenantId,
    month,
    inputTokens: 100,
    outputTokens: 50,
    costInr,
    cap,
  } as never);
}

describe.skipIf(!hasInfra)('getAiUsageSummary (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  async function freshTenant(prefix: string): Promise<TestTenantFixture> {
    const t = await createTestTenant(prefix);
    cleanup.push(t.cleanup);
    return t;
  }

  it('AU1: zero-row tenant returns synthetic 0/cap for current month', async () => {
    const t = await freshTenant('aiu1');
    const summary = await getAiUsageSummary(ctxFor(t), { months: 0 });

    expect(summary.current.costInr).toBe(0);
    expect(summary.current.synthetic).toBe(true);
    expect(summary.current.pctUsed).toBe(0);
    // Free plan default
    expect(summary.current.cap).toBe(10_000);
    expect(summary.history).toHaveLength(0);
  });

  it('AU2: existing row aggregates with correct pctUsed', async () => {
    const t = await freshTenant('aiu2');
    await seedAiUsage(t.tenantId, currentMonthKey(), 5_000, 50_000);

    const summary = await getAiUsageSummary(ctxFor(t), { months: 0 });

    expect(summary.current.costInr).toBe(5_000);
    expect(summary.current.cap).toBe(50_000);
    expect(summary.current.pctUsed).toBe(10); // 5000/50000 = 10%
    expect(summary.current.synthetic).toBe(false);
  });

  it('AU3: history returns months in newest-first order', async () => {
    const t = await freshTenant('aiu3');
    await seedAiUsage(t.tenantId, previousMonthKey(1), 1_000, 50_000);
    await seedAiUsage(t.tenantId, previousMonthKey(2), 2_000, 50_000);
    await seedAiUsage(t.tenantId, previousMonthKey(3), 3_000, 50_000);

    const summary = await getAiUsageSummary(ctxFor(t), { months: 6 });

    expect(summary.history).toHaveLength(6);
    // Months 1, 2, 3 have rows; 4-6 are synthetic.
    expect(summary.history[0]?.month).toBe(previousMonthKey(1));
    expect(summary.history[0]?.costInr).toBe(1_000);
    expect(summary.history[1]?.month).toBe(previousMonthKey(2));
    expect(summary.history[1]?.costInr).toBe(2_000);
    expect(summary.history[2]?.month).toBe(previousMonthKey(3));
    expect(summary.history[2]?.costInr).toBe(3_000);
    expect(summary.history[3]?.synthetic).toBe(true);
  });

  it('AU4: cross-tenant isolation — tenant A summary excludes tenant B rows', async () => {
    const tA = await freshTenant('aiu4a');
    const tB = await freshTenant('aiu4b');
    await seedAiUsage(tA.tenantId, currentMonthKey(), 5_000, 50_000);
    await seedAiUsage(tB.tenantId, currentMonthKey(), 99_999, 50_000);

    const summaryA = await getAiUsageSummary(ctxFor(tA), { months: 0 });
    expect(summaryA.current.costInr).toBe(5_000);
    expect(summaryA.current.costInr).not.toBe(99_999);
  });

  it('AU5: pctUsed clamps to 999 on absurd values', async () => {
    const t = await freshTenant('aiu5');
    // Cost 10x the cap → pctUsed would be 1000% if unclamped.
    await seedAiUsage(t.tenantId, currentMonthKey(), 500_000, 50_000);

    const summary = await getAiUsageSummary(ctxFor(t), { months: 0 });
    expect(summary.current.pctUsed).toBe(999);
  });
});
