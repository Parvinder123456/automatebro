/**
 * Spec 011 §7 — dashboard UI E2E.
 *
 * Tests the new tenant dashboard surface introduced in spec 011:
 *   D1: sidebar visible + active link highlighted on /app/dashboard
 *   D2: /app/automations renders list of seeded automations + "New automation" link
 *   D3: /app/automations/new renders form gated by hydration sentinel; submit POSTs and redirects
 *   D4: /app/leads renders table + CSV download link
 *   D5: /app/sends renders table + status filter links
 *
 * EXCEPTION to "no native pg" rule: see onboarding.spec.ts header.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { type TestUser, createTestUser, deleteTestUser } from './_fixtures/auth.js';

const skipReason = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? null
  : 'SUPABASE_SERVICE_ROLE_KEY not set';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({
    connectionString: process.env.STRICTDB_URI,
    connectionTimeoutMillis: 5_000,
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

interface SeedResult {
  tenantId: string;
  igAccountId: string;
  igUsername: string;
  automationId: string;
  leadId: string;
  sendId: string;
}

async function seedTenantWithFixtures(userId: string): Promise<SeedResult> {
  const tenantId = randomUUID();
  const igAccountId = randomUUID();
  const igUsername = `dash_${tenantId.slice(0, 8)}`;
  const automationId = randomUUID();
  const triggerId = randomUUID();
  const responseId = randomUUID();
  const leadId = randomUUID();
  const sendId = randomUUID();

  await withDb(async (c) => {
    await c.query(
      'INSERT INTO public."users" ("_id", "email", "createdAt") VALUES ($1, $2, now()) ON CONFLICT ("_id") DO NOTHING',
      [userId, `${userId}@example.test`],
    );
    await c.query(
      'INSERT INTO public."tenants" ("_id", "name", "slug", "plan", "createdAt") VALUES ($1, $2, $3, $4, now())',
      [tenantId, 'Dash Test', `dash-${tenantId.slice(0, 8)}`, 'free'],
    );
    await c.query(
      'INSERT INTO public."tenantUsers" ("_id", "tenantId", "userId", "role", "acceptedAt") VALUES ($1, $2, $3, $4, now())',
      [randomUUID(), tenantId, userId, 'owner'],
    );
    await c.query(
      `INSERT INTO public."igAccounts"
        ("_id", "tenantId", "igUserId", "igUsername", "pageId", "pageName",
         "accessTokenCiphertext", "accessTokenIv", "accessTokenTag", "tokenKeyVersion",
         "scopes", "connectedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
      [
        igAccountId,
        tenantId,
        `ig-${igAccountId.slice(0, 8)}`,
        igUsername,
        `page-${igAccountId.slice(0, 8)}`,
        'Test Page',
        randomBytes(32),
        randomBytes(12),
        randomBytes(16),
        1,
        ['instagram_basic'],
      ],
    );
    await c.query(
      `INSERT INTO public."automations"
        ("_id", "tenantId", "igAccountId", "name", "trigger", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [automationId, tenantId, igAccountId, 'Seed Automation', 'comment', 'active'],
    );
    await c.query(
      `INSERT INTO public."triggers"
        ("_id", "tenantId", "automationId", "keywords", "matchMode", "postIds")
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [triggerId, tenantId, automationId, ['LINK'], 'contains'],
    );
    await c.query(
      `INSERT INTO public."responses"
        ("_id", "tenantId", "automationId", "mode", "template", "aiPrompt", "aiTone",
         "fallbackTemplate", "commentReply")
       VALUES ($1, $2, $3, 'static', 'Here is the link', NULL, NULL, NULL, NULL)`,
      [responseId, tenantId, automationId],
    );
    await c.query(
      `INSERT INTO public."leads"
        ("_id", "tenantId", "igAccountId", "igUserId", "igUsername", "email", "phone",
         "firstSeenAt", "lastSeenAt", "tags", "attributedAutomationId")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, now(), now(), $7, NULL)`,
      [
        leadId,
        tenantId,
        igAccountId,
        `psid-${leadId.slice(0, 8)}`,
        'lead_user',
        'lead@example.test',
        ['e2e-fixture'],
      ],
    );
    await c.query(
      `INSERT INTO public."sends"
        ("_id", "tenantId", "igAccountId", "automationId", "recipientPsid", "kind", "content",
         "aiGenerated", "status", "metaMessageId", "errorCode", "errorMessage", "attempt",
         "queuedAt", "sentAt", "failedAt")
       VALUES ($1, $2, $3, $4, $5, 'dm', 'hello', false, 'sent', 'mid-123', NULL, NULL, 0,
               now(), now(), NULL)`,
      [sendId, tenantId, igAccountId, automationId, `psid-${leadId.slice(0, 8)}`],
    );
  });

  return { tenantId, igAccountId, igUsername, automationId, leadId, sendId };
}

async function cleanup(userId: string): Promise<void> {
  await withDb(async (c) => {
    await c.query(
      'DELETE FROM public."tenants" WHERE "_id" IN (SELECT "tenantId" FROM public."tenantUsers" WHERE "userId" = $1)',
      [userId],
    );
    await c.query('DELETE FROM public."users" WHERE "_id" = $1', [userId]);
  }).catch(() => undefined);
}

async function loginAndGoToDashboard(page: import('@playwright/test').Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/app\/dashboard$/, {
    timeout: 30_000,
    waitUntil: 'domcontentloaded',
  });
}

test.describe('dashboard UI (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;
  let seed: SeedResult | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-dash');
    seed = await seedTenantWithFixtures(user.userId);
  });

  test.afterEach(async () => {
    if (user) {
      await cleanup(user.userId);
      await deleteTestUser(user.userId);
    }
    user = null;
    seed = null;
  });

  test('D1: sidebar shows nav links with Dashboard active', async ({ page }) => {
    if (!user) throw new Error('setup');
    await loginAndGoToDashboard(page, user);

    await expect(page).toHaveURL(/\/app\/dashboard$/);
    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar).toBeVisible();

    for (const label of ['Dashboard', 'Automations', 'Leads', 'Sends', 'Integrations']) {
      await expect(sidebar.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(sidebar.getByTestId('nav-active')).toContainText('Dashboard');
  });

  test('D2: /app/automations lists seeded automation', async ({ page }) => {
    if (!user || !seed) throw new Error('setup');
    await loginAndGoToDashboard(page, user);
    await page.getByRole('link', { name: 'Automations' }).first().click();
    await page.waitForURL(/\/app\/automations$/, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/app\/automations$/);
    const row = page.getByTestId(`automation-row-${seed.automationId}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Seed Automation');
    await expect(row).toContainText('active');
    await expect(page.getByTestId('new-automation-link')).toBeVisible();
  });

  test('D3: create automation form submits and redirects to list', async ({ page }) => {
    if (!user || !seed) throw new Error('setup');
    await loginAndGoToDashboard(page, user);

    await page.goto('/app/automations/new');
    await page.waitForLoadState('domcontentloaded');

    const form = page.getByTestId('automation-form');
    await expect(form).toHaveAttribute('data-hydrated', 'true');

    await form.getByLabel('Name').fill('Promo Drop');
    // igAccount select prepopulated with the seeded account
    await form.getByLabel('Instagram account').selectOption({ label: `@${seed.igUsername}` });
    await form.getByLabel('Keywords').fill('PROMO\nSALE');
    await form.getByLabel('Reply template').fill('Use code SAVE10');

    const submit = form.getByTestId('automation-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(/\/app\/automations$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/app\/automations$/);
    await expect(page.getByText('Promo Drop')).toBeVisible();
  });

  test('D4: /app/leads renders rows + CSV download link', async ({ page }) => {
    if (!user || !seed) throw new Error('setup');
    await loginAndGoToDashboard(page, user);
    await page.goto('/app/leads');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/app\/leads$/);
    const table = page.getByTestId('leads-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('lead@example.test');

    const csvLink = page.getByTestId('leads-csv-link');
    await expect(csvLink).toBeVisible();
    await expect(csvLink).toHaveAttribute('href', /\/api\/v1\/leads\?format=csv/);
  });

  test('D5: /app/sends renders sends table + status filter', async ({ page }) => {
    if (!user || !seed) throw new Error('setup');
    await loginAndGoToDashboard(page, user);
    await page.goto('/app/sends');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/app\/sends/);
    const table = page.getByTestId('sends-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('hello');

    // Status filter row visible with at least the "All" and "Sent" links.
    const filter = page.getByTestId('sends-status-filter');
    await expect(filter).toBeVisible();
    await expect(filter.getByRole('link', { name: 'All' })).toBeVisible();
    await expect(filter.getByRole('link', { name: 'Sent' })).toBeVisible();
  });
});
