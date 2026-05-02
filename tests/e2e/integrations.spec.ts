/**
 * Spec 004 §8.3 — /app/integrations E2E tests.
 *
 * Real Facebook OAuth can't be E2E-tested through Playwright (Meta
 * blocks browser automation through their auth screens). We test:
 *   - Page renders for an authenticated tenant
 *   - "Connect Instagram" button is present + links to /api/v1/auth/meta/start
 *   - /api/v1/auth/meta/start sets state cookie + redirects to facebook.com
 *   - Empty state shows "No accounts connected yet"
 *   - With a fixture-inserted igAccounts row, the page lists the username
 *   - Disconnect removes the row
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

async function rawQuery(sql: string, params: unknown[]): Promise<unknown[][]> {
  const conn = process.env.STRICTDB_URI;
  if (!conn) return [];
  const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5_000 });
  try {
    await c.connect();
    const r = await c.query(sql, params);
    return r.rows;
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function createTenantForUser(userId: string, name: string): Promise<string> {
  const tenantId = randomUUID();
  const slug = `iso-${Math.random().toString(36).slice(2, 10)}`;
  const conn = process.env.STRICTDB_URI;
  if (!conn) throw new Error('no STRICTDB_URI');
  const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5_000 });
  try {
    await c.connect();
    await c.query(
      'INSERT INTO public."users" ("_id", "email", "createdAt") VALUES ($1, $2, now()) ON CONFLICT ("_id") DO NOTHING',
      [userId, `${userId}@example.test`],
    );
    await c.query(
      'INSERT INTO public."tenants" ("_id", "name", "slug", "plan", "createdAt") VALUES ($1, $2, $3, $4, now())',
      [tenantId, name, slug, 'free'],
    );
    await c.query(
      'INSERT INTO public."tenantUsers" ("_id", "tenantId", "userId", "role", "acceptedAt") VALUES ($1, $2, $3, $4, now())',
      [randomUUID(), tenantId, userId, 'owner'],
    );
  } finally {
    await c.end().catch(() => undefined);
  }
  return tenantId;
}

async function insertIgAccount(tenantId: string, username: string): Promise<string> {
  const id = randomUUID();
  const conn = process.env.STRICTDB_URI;
  if (!conn) throw new Error('no STRICTDB_URI');
  const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5_000 });
  try {
    await c.connect();
    await c.query(
      `INSERT INTO public."igAccounts"
        ("_id", "tenantId", "igUserId", "igUsername", "pageId", "pageName",
         "accessTokenCiphertext", "accessTokenIv", "accessTokenTag",
         "tokenKeyVersion", "scopes", "connectedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
      [
        id,
        tenantId,
        `ig-${randomUUID()}`,
        username,
        `page-${randomUUID()}`,
        'Test Page',
        randomBytes(32),
        randomBytes(12),
        randomBytes(16),
        1,
        ['instagram_basic'],
      ],
    );
  } finally {
    await c.end().catch(() => undefined);
  }
  return id;
}

async function deleteTenantData(userId: string): Promise<void> {
  const conn = process.env.STRICTDB_URI;
  if (!conn) return;
  const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5_000 });
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

test.describe('/app/integrations (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;
  let tenantId: string | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-integ');
    tenantId = await createTenantForUser(user.userId, 'Integ Workspace');
  });

  test.afterEach(async () => {
    if (user !== null) {
      await deleteTenantData(user.userId);
      await deleteTestUser(user.userId);
    }
    user = null;
    tenantId = null;
  });

  test('IT1: empty state shows when no accounts connected', async ({ page }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await page.goto('/app/integrations');
    await expect(page.getByTestId('integrations-page')).toBeVisible();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('connect-instagram')).toBeVisible();
  });

  test('IT2: connect button has correct href to /api/v1/auth/meta/start', async ({ page }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await page.goto('/app/integrations');

    const href = await page.getByTestId('connect-instagram').getAttribute('href');
    expect(href).toBe('/api/v1/auth/meta/start');
  });

  test('IT3: /api/v1/auth/meta/start redirects to facebook.com with state cookie', async ({
    page,
  }) => {
    if (user === null) throw new Error('user not created');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // Hit /start without following redirects so we can inspect the response.
    const response = await page.request.get('/api/v1/auth/meta/start', {
      maxRedirects: 0,
    });
    expect([301, 302, 303]).toContain(response.status());
    const location = response.headers().location;
    expect(location).toBeDefined();
    expect(location).toContain('facebook.com');
    expect(location).toContain('client_id=');
    expect(location).toContain('state=');
    expect(location).toContain('redirect_uri=');
  });

  test('IT4: page lists fixture-inserted igAccount and disconnect removes it', async ({ page }) => {
    if (user === null || tenantId === null) throw new Error('user not created');

    // Insert a fixture igAccount directly (skipping real OAuth).
    await insertIgAccount(tenantId, 'studio_test');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
    await page.goto('/app/integrations');

    await expect(page.getByTestId('account-list')).toBeVisible();
    await expect(page.getByTestId('account-studio_test')).toBeVisible();
    await expect(page.getByTestId('account-studio_test')).toContainText('studio_test');

    // The disconnect button triggers a confirm() dialog — auto-accept.
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByTestId('account-studio_test').getByTestId('disconnect-button').click();
    // window.location.reload() triggers a navigation; wait for empty state.
    await expect(page.getByTestId('empty-state')).toBeVisible({ timeout: 15_000 });

    // Confirm DB state too.
    const remaining = await rawQuery('SELECT 1 FROM public."igAccounts" WHERE "tenantId" = $1', [
      tenantId,
    ]);
    expect(remaining.length).toBe(0);
  });
});
