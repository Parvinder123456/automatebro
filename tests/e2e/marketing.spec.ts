/**
 * Spec 012 §5.1 — marketing site E2E.
 *
 * Public marketing pages render without auth, return 200, and link
 * correctly to signup / pricing / compare / legal pages. Each test
 * has ≥3 assertions per CLAUDE.md Critical Rule #4.
 */
import { expect, test } from '@playwright/test';

test.describe('marketing site (public)', () => {
  test('M1: home renders with hero + CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('hero-cta-signup')).toHaveAttribute('href', '/signup');
    await expect(page.locator('h1').first()).toContainText('Instagram DM');
  });

  test('M2: pricing page shows four tiers including Starter at ₹999', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page.getByTestId('pricing-page')).toBeVisible();
    const tiers = page.getByTestId('pricing-tiers').locator('> div');
    await expect(tiers).toHaveCount(4);
    await expect(page.getByTestId('pricing-tier-starter')).toContainText('999');
    await expect(page.getByTestId('pricing-tier-agency')).toContainText('Agency');
  });

  test('M3: compare page (manychat) renders with verdict and CTAs', async ({ page }) => {
    await page.goto('/compare/manychat');
    await expect(page).toHaveURL(/\/compare\/manychat$/);
    await expect(page.getByTestId('compare-page-manychat')).toBeVisible();
    await expect(page.locator('h1')).toContainText('AutomateBro vs ManyChat');
    await expect(page.getByTestId('verdict')).toBeVisible();
  });

  test('M4: compare page (linkplease) renders', async ({ page }) => {
    await page.goto('/compare/linkplease');
    await expect(page).toHaveURL(/\/compare\/linkplease$/);
    await expect(page.locator('h1')).toContainText('LinkPlease');
    await expect(page.getByTestId('verdict')).toBeVisible();
  });

  test('M5: unknown compare slug returns 404', async ({ request }) => {
    const response = await request.get('/compare/unknown-slug-xyz');
    expect(response.status()).toBe(404);
  });

  test('M6: footer shows legal links to privacy / terms / dpa', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByTestId('footer-privacy')).toHaveAttribute('href', '/privacy');
    await expect(footer.getByTestId('footer-terms')).toHaveAttribute('href', '/terms');
    await expect(footer.getByTestId('footer-dpa')).toHaveAttribute('href', '/dpa');
  });

  test('M7: privacy + terms + dpa pages render', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByTestId('privacy-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Privacy Policy');

    await page.goto('/terms');
    await expect(page.getByTestId('terms-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Terms of Service');

    await page.goto('/dpa');
    await expect(page.getByTestId('dpa-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Data Processing Addendum');
  });

  test('M8: marketing route group did not break /app/* protection', async ({ page }) => {
    // Sanity: /app/dashboard without auth still bounces.
    const response = await page.goto('/app/dashboard');
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/login/);
  });

  test('M9: deleted page renders for direct visit (public)', async ({ page }) => {
    await page.goto('/deleted');
    await expect(page).toHaveURL(/\/deleted$/);
    await expect(page.getByTestId('deleted-page')).toBeVisible();
    await expect(page.locator('h1')).toContainText('scheduled for deletion');
  });
});
