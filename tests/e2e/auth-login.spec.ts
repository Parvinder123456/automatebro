/**
 * Spec 002 §10.3 — login E2E tests.
 *
 * E2: login happy path → /onboarding (via /app redirect)
 * E3: login wrong password shows inline error
 * E5: logout clears session
 *
 * Each test creates a fresh user via the admin API + cleans up after.
 */
import { expect, test } from '@playwright/test';
import { type TestUser, createTestUser, deleteTestUser } from './_fixtures/auth.js';

const skipReason = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? null
  : 'SUPABASE_SERVICE_ROLE_KEY not set';

test.describe('login flows (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-login');
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.userId);
    user = null;
  });

  test('E2: login happy path → /onboarding', async ({ page }) => {
    if (!user) throw new Error('user not created');
    await page.goto('/login');
    await page.waitForLoadState('networkidle'); // wait for React hydration
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();

    // After login, /app redirects to /onboarding (spec 002 placeholder).
    await page.waitForURL(/\/onboarding$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByTestId('onboarding-page')).toBeVisible();
    await expect(page.locator('strong')).toContainText(user.email);
  });

  test('E3: login with wrong password shows inline error', async ({ page }) => {
    if (!user) throw new Error('user not created');
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('WRONG-PASSWORD-123');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('E5: logout clears session and protects /onboarding again', async ({ page }) => {
    if (!user) throw new Error('user not created');
    // log in
    await page.goto('/login');
    await page.waitForLoadState('networkidle'); // wait for React hydration
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/onboarding$/, { timeout: 30_000, waitUntil: 'domcontentloaded' });

    // sign out
    await page.locator('form[action="/logout"] button[type="submit"]').click();
    await page.waitForURL(/^https?:\/\/[^/]+\/?$/, {
      timeout: 20_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/?$/);

    // accessing /onboarding now redirects to /login
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fonboarding/);
  });
});
