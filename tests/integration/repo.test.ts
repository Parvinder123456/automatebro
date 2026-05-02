/**
 * Spec 003 §10.3 + §10.5 — repo helpers + cross-tenant leakage tests.
 *
 * These tests exercise the multi-tenancy chokepoint. They run against
 * the real Supabase Postgres database (gated by hasInfra).
 *
 * We use the `tenantUsers` collection as the test surface because it
 * exists from spec 003. We don't need to create a fake collection —
 * each test tenant gets its own membership row.
 */
import type { Ctx } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { repo } from '@automatebro/shared/db/repo';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestTenantFixture, createTestTenant } from './_fixtures/tenants.js';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function ctxFor(t: TestTenantFixture): Ctx {
  return { userId: t.userId, tenantId: t.tenantId, role: 'owner', email: t.email };
}

describe.skipIf(!hasInfra)('repo helpers + cross-tenant leakage (integration)', () => {
  let tenantA: TestTenantFixture;
  let tenantB: TestTenantFixture;

  beforeAll(async () => {
    tenantA = await createTestTenant('repoA');
    tenantB = await createTestTenant('repoB');
  }, 30_000);

  afterAll(async () => {
    await tenantA?.cleanup();
    await tenantB?.cleanup();
  }, 30_000);

  it('R1: repo.queryOne auto-merges tenantId from ctx', async () => {
    const ctx = ctxFor(tenantA);
    // tenantUsers has tenantA's owner row. Query without specifying
    // tenantId — repo should add it.
    const row = await repo.queryOne<{ userId: string; role: string }>(
      'tenantUsers',
      { userId: ctx.userId },
      ctx,
    );
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(ctx.userId);
  });

  it('R2: repo overrides any tenantId the caller passes (privilege escalation defence)', async () => {
    // ctx is tenantA but we pass tenantB.tenantId in the filter.
    // Expectation: repo overwrites with tenantA, returns tenantA's row.
    const ctxA = ctxFor(tenantA);
    const row = await repo.queryOne<{ tenantId: string }>(
      'tenantUsers',
      { tenantId: tenantB.tenantId, userId: tenantA.userId },
      ctxA,
    );
    expect(row).not.toBeNull();
    expect(row?.tenantId).toBe(tenantA.tenantId);
  });

  it('R3: requireTenant throws when ctx has null tenantId', async () => {
    const ctxNoTenant: Ctx = {
      userId: 'fake-user',
      tenantId: null,
      role: null,
      email: 'noone@nowhere.test',
    };
    await expect(repo.queryOne('tenantUsers', {}, ctxNoTenant)).rejects.toThrow(/tenantId/);
  });

  it('R4: repo.count auto-merges tenantId', async () => {
    const ctxA = ctxFor(tenantA);
    const count = await repo.count('tenantUsers', {}, ctxA);
    // tenantA has exactly one membership (the owner from fixture).
    expect(count).toBe(1);
  });

  it('X1: tenant B cannot see tenant A data via repo', async () => {
    const ctxB = ctxFor(tenantB);
    const rows = await repo.queryMany('tenantUsers', { userId: tenantA.userId }, ctxB, {
      limit: 100,
    });
    expect(rows).toHaveLength(0);
  });

  it('X2: tenant B passing tenantA.tenantId in filter still gets 0 rows (override works)', async () => {
    const ctxB = ctxFor(tenantB);
    const rows = await repo.queryMany(
      'tenantUsers',
      { tenantId: tenantA.tenantId, userId: tenantA.userId },
      ctxB,
      { limit: 100 },
    );
    expect(rows).toHaveLength(0);
  });

  it('X3: direct db.* call BYPASSES the chokepoint (documents the threat)', async () => {
    // This test deliberately demonstrates that bypassing repo lets a
    // caller see another tenant's data. The mitigation is code review
    // + the planned RuleCatch rule "use repo, not db inside handlers".
    const db = await getDb();
    const rows = await db.queryMany('tenantUsers', { tenantId: tenantA.tenantId }, { limit: 100 });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // Same query through repo from the wrong ctx returns 0.
    const ctxB = ctxFor(tenantB);
    const safeRows = await repo.queryMany('tenantUsers', {}, ctxB, { limit: 100 });
    // ctxB has its OWN row, but not A's.
    expect(safeRows.every((r) => (r as { userId: string }).userId !== tenantA.userId)).toBe(true);
  });
});

describe.skipIf(hasInfra)('repo (no infra)', () => {
  it('skipped: STRICTDB_URI / SUPABASE_* not set', () => {
    expect(true).toBe(true);
  });
});
