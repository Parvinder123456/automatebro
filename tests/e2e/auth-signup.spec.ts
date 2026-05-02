/**
 * Spec 002 §10.3 E1 — signup happy path.
 *
 * Sign up via the form → land on /verify → admin-confirm the user via
 * Supabase admin API (bypasses email click) → log in → reach /onboarding.
 *
 * Uses a fresh email per test run.
 *
 * KNOWN LIMITATION: Supabase's built-in dev SMTP has a strict rate limit
 * (~2 emails/hour on the free tier). When this test runs in tight CI or
 * during repeated local runs, Supabase rejects the signup with a 429,
 * the form shows an error, and we never reach /verify. Spec 002 §11
 * acknowledges this — we'll swap in Resend SMTP via Supabase's custom
 * SMTP integration during spec 014, at which point this test can run
 * reliably. Until then, set RUN_SIGNUP_E2E=1 to opt into the test
 * locally when you want to exercise the path manually.
 */
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const skipReason = !process.env.SUPABASE_SERVICE_ROLE_KEY
  ? 'SUPABASE_SERVICE_ROLE_KEY not set'
  : !process.env.RUN_SIGNUP_E2E
    ? 'Skipped by default — see header comment about Supabase SMTP rate limit'
    : null;

test.describe('signup happy path (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  test('E1: signup → verify page → admin-confirm → login → onboarding', async ({ page }) => {
    const email = `e2e-signup+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@automatebro.test`;
    const password = 'S3curepass!word';

    // 1. signup
    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByTestId('signup-submit').click();

    // 2. lands on /verify
    await page.waitForURL(/\/verify$/, { timeout: 15_000, waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('verify-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Check your email');

    // 3. admin-confirm the user (bypass email click)
    const admin = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const created = list.users.find((u) => u.email === email);
    if (!created) throw new Error(`user ${email} not found after signup`);
    const { error: updateErr } = await admin.auth.admin.updateUserById(created.id, {
      email_confirm: true,
    });
    expect(updateErr).toBeNull();

    try {
      // 4. log in with the now-verified user
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByTestId('login-submit').click();

      // 5. reach /onboarding
      await page.waitForURL(/\/onboarding$/, {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.getByTestId('onboarding-page')).toBeVisible();
      await expect(page.locator('strong')).toContainText(email);
    } finally {
      await admin.auth.admin.deleteUser(created.id).catch(() => undefined);
    }
  });
});
