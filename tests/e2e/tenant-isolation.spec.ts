/**
 * Spec 003 §10.6 — tenant isolation E2E.
 *
 * ET1: User A and User B sign up with separate workspaces. Their
 *      /api/v1/tenants/me responses identify their own tenant only.
 * ET2: One-shot onboarding — POSTing to /api/v1/tenants twice as the
 *      same user returns 409.
 *
 * These exercise the full HTTP path including middleware + ctx + repo.
 */
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { type TestUser, createTestUser, deleteTestUser } from './_fixtures/auth.js';

const skipReason = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? null
  : 'SUPABASE_SERVICE_ROLE_KEY not set';

async function deleteTenantByOwner(userId: string): Promise<void> {
  const conn = process.env.STRICTDB_URI;
  if (!conn) return;
  const c = new Client({ connectionString: conn });
  try {
    await c.connect();
    await c.query(
      'DELETE FROM public."tenants" WHERE "_id" IN (SELECT "tenantId" FROM public."tenantUsers" WHERE "userId" = $1)',
      [userId],
    );
    await c.query('DELETE FROM public."users" WHERE "_id" = $1', [userId]);
  } catch {
    // best-effort
  } finally {
    await c.end().catch(() => undefined);
  }
}

test.describe('tenant isolation (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  test('ET1: user A and user B see only their own tenant via /api/v1/tenants/me', async ({
    browser,
  }) => {
    let userA: TestUser | null = null;
    let userB: TestUser | null = null;
    try {
      userA = await createTestUser('e2e-isoA');
      userB = await createTestUser('e2e-isoB');

      // Two isolated browser contexts so cookies don't bleed.
      const ctxA = await browser.newContext();
      const ctxB = await browser.newContext();
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      // User A onboards
      await pageA.goto('/login');
      await pageA.waitForLoadState('networkidle');
      await pageA.getByLabel('Email').fill(userA.email);
      await pageA.getByLabel('Password').fill(userA.password);
      await pageA.getByTestId('login-submit').click();
      await pageA.waitForURL(/\/onboarding$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(pageA.getByTestId('workspace-form')).toHaveAttribute('data-hydrated', 'true');
      await pageA.getByLabel('Workspace name').fill('Workspace A');
      await pageA.getByTestId('workspace-submit').click();
      await pageA.waitForURL(/\/app\/dashboard$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });

      // User B onboards
      await pageB.goto('/login');
      await pageB.waitForLoadState('networkidle');
      await pageB.getByLabel('Email').fill(userB.email);
      await pageB.getByLabel('Password').fill(userB.password);
      await pageB.getByTestId('login-submit').click();
      await pageB.waitForURL(/\/onboarding$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(pageB.getByTestId('workspace-form')).toHaveAttribute('data-hydrated', 'true');
      await pageB.getByLabel('Workspace name').fill('Workspace B');
      await pageB.getByTestId('workspace-submit').click();
      await pageB.waitForURL(/\/app\/dashboard$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });

      // Read /api/v1/tenants/me for both — names must NOT cross-contaminate.
      const meA = await pageA.request.get('/api/v1/tenants/me');
      const meB = await pageB.request.get('/api/v1/tenants/me');
      expect(meA.status()).toBe(200);
      expect(meB.status()).toBe(200);
      const bodyA = await meA.json();
      const bodyB = await meB.json();
      expect(bodyA.tenant?.name).toBe('Workspace A');
      expect(bodyB.tenant?.name).toBe('Workspace B');
      expect(bodyA.tenant?._id).not.toBe(bodyB.tenant?._id);

      await ctxA.close();
      await ctxB.close();
    } finally {
      if (userA) {
        await deleteTenantByOwner(userA.userId);
        await deleteTestUser(userA.userId);
      }
      if (userB) {
        await deleteTenantByOwner(userB.userId);
        await deleteTestUser(userB.userId);
      }
    }
  });

  test('ET2: one-shot onboarding — POST /api/v1/tenants twice returns 409', async ({ page }) => {
    let user: TestUser | null = null;
    try {
      user = await createTestUser('e2e-oneshot');

      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill(user.password);
      await page.getByTestId('login-submit').click();
      await page.waitForURL(/\/onboarding$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByTestId('workspace-form')).toHaveAttribute('data-hydrated', 'true');

      // First POST succeeds via the form.
      await page.getByLabel('Workspace name').fill('First Workspace');
      await page.getByTestId('workspace-submit').click();
      await page.waitForURL(/\/app\/dashboard$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });

      // Second POST via raw fetch — should 409.
      const second = await page.request.post('/api/v1/tenants', {
        data: { name: 'Second Workspace' },
      });
      expect(second.status()).toBe(409);
      const body = await second.json();
      expect(body.error).toBe('tenant_exists');
    } finally {
      if (user) {
        await deleteTenantByOwner(user.userId);
        await deleteTestUser(user.userId);
      }
    }
  });
});
