import { expect, test } from '@playwright/test';
/**
 * Spec 003 §10.6 — onboarding E2E tests.
 *
 * EO1: signup → email-confirm via admin → login → /app → /onboarding
 *      → fill workspace name → submit → land on /app/dashboard.
 * EO2: protected /app/dashboard pre-onboarding redirects to /onboarding.
 * EO3: completed user re-visiting /onboarding redirects to /app/dashboard.
 *
 * Each test creates a fresh Supabase Auth user via admin API and cleans
 * up + cascades through the database.
 */
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
    // FK cascade from tenants → tenantUsers; we still need to clean the
    // user row.
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

test.describe('onboarding flow (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-onboarding');
  });

  test.afterEach(async () => {
    if (user !== null) {
      await deleteTenantByOwner(user.userId);
      await deleteTestUser(user.userId);
    }
    user = null;
  });

  test('EO1: log in → /app → /onboarding → submit form → /app/dashboard', async ({ page }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();

    // Logged-in user with no tenant → /app redirects to /onboarding.
    await page.waitForURL(/\/onboarding$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('onboarding-page')).toBeVisible();
    await expect(page.getByTestId('workspace-form')).toBeVisible();
    // Wait for React to hydrate (form sets data-hydrated=true on mount).
    // Without this, fast clicks fire a native form submit (GET to current
    // URL with form fields) before JS attaches the onSubmit handler.
    await expect(page.getByTestId('workspace-form')).toHaveAttribute('data-hydrated', 'true');

    // Fill form
    const workspaceName = `Test Studio ${Date.now()}`;
    await page.getByLabel('Workspace name').fill(workspaceName);
    await page.getByTestId('workspace-submit').click();

    // Lands on /app/dashboard with workspace name visible
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('dashboard-page')).toBeVisible();
    await expect(page.getByTestId('workspace-name')).toContainText(workspaceName);
  });

  test('EO2: pre-onboarding /app/dashboard redirects to /onboarding', async ({ page }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/onboarding$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Try to skip ahead — middleware/layout redirects back.
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('EO3: post-onboarding visit to /onboarding redirects to /app/dashboard', async ({
    page,
  }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/onboarding$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('workspace-form')).toHaveAttribute('data-hydrated', 'true');

    await page.getByLabel('Workspace name').fill('Test Studio EO3');
    await page.getByTestId('workspace-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Try to revisit /onboarding — bounced to dashboard.
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });
});
