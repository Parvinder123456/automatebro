/**
 * Spec 002 §10.3 E6 — public routes are accessible without auth.
 *
 * Health, signup, login, and forgot-password all return 200 (or their
 * own status), NOT a 302 redirect to /login.
 */
import { expect, test } from '@playwright/test';

test.describe('public routes (no auth)', () => {
  test('E6a: GET / returns 200', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('AutomateBro');
    // Spec 012 marketing site — header CTA + hero CTA copy.
    expect(html).toContain('Sign up');
    expect(html).toContain('Start free');
  });

  test('E6b: GET /signup returns 200 and renders the form', async ({ page }) => {
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByTestId('signup-form')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('E6c: GET /login returns 200 and renders the form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('E6d: GET /forgot-password returns 200', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByTestId('forgot-password-form')).toBeVisible();
  });

  test('E6e: GET /api/v1/health returns 200 with ok payload (no redirect)', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});
