/**
 * Spec 002 §10.3 E4 — protected route without session redirects to /login.
 */
import { expect, test } from '@playwright/test';

test.describe('protected routes redirect when unauthenticated', () => {
  test('E4a: /onboarding without session redirects to /login with returnTo', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fonboarding/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('E4b: /app without session redirects to /login', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fapp/);
  });

  test('E4c: /api/v1/automations without session returns 401 JSON (not redirect)', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/automations');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('unauthorized');
  });
});
