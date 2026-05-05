/**
 * Spec 007 §6.2 — automations CRUD E2E.
 *
 * Tests POST/GET/PATCH/DELETE /api/v1/automations against the real
 * dev server, with a fixture igAccount inserted directly into the DB.
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

async function setupTenantAndIgAccount(userId: string): Promise<{
  tenantId: string;
  igAccountId: string;
}> {
  const tenantId = randomUUID();
  const igAccountId = randomUUID();
  await withDb(async (c) => {
    await c.query(
      'INSERT INTO public."users" ("_id", "email", "createdAt") VALUES ($1, $2, now()) ON CONFLICT ("_id") DO NOTHING',
      [userId, `${userId}@example.test`],
    );
    await c.query(
      'INSERT INTO public."tenants" ("_id", "name", "slug", "plan", "createdAt") VALUES ($1, $2, $3, $4, now())',
      [tenantId, 'Auto Test', `auto-${tenantId.slice(0, 8)}`, 'free'],
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
        `ig-test-${igAccountId.slice(0, 8)}`,
        'studio_auto_test',
        `page-${igAccountId.slice(0, 8)}`,
        'Test Page',
        randomBytes(32),
        randomBytes(12),
        randomBytes(16),
        1,
        ['instagram_basic'],
      ],
    );
  });
  return { tenantId, igAccountId };
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

test.describe('automations CRUD (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;
  let igAccountId: string | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-auto');
    const setup = await setupTenantAndIgAccount(user.userId);
    igAccountId = setup.igAccountId;
  });

  test.afterEach(async () => {
    if (user) {
      await cleanup(user.userId);
      await deleteTestUser(user.userId);
    }
    user = null;
    igAccountId = null;
  });

  test('A1: full CRUD lifecycle', async ({ page }) => {
    if (!user || !igAccountId) throw new Error('setup');

    // Login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // CREATE
    const create = await page.request.post('/api/v1/automations', {
      data: {
        igAccountId,
        name: 'Link Drop',
        keywords: ['LINK', 'send link'],
        matchMode: 'contains',
        response: { mode: 'static', template: 'Here you go: https://example.com' },
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.automation.name).toBe('Link Drop');
    expect(created.trigger.keywords).toEqual(['LINK', 'send link']);
    expect(created.response.template).toContain('https://example.com');

    const automationId = created.automation._id;

    // LIST
    const list = await page.request.get('/api/v1/automations');
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect(listBody.automations).toHaveLength(1);
    expect(listBody.automations[0].automation._id).toBe(automationId);

    // PATCH
    const patch = await page.request.patch(`/api/v1/automations/${automationId}`, {
      data: { name: 'Link Drop v2', status: 'paused' },
    });
    expect(patch.status()).toBe(200);

    const list2 = await page.request.get('/api/v1/automations');
    const list2Body = await list2.json();
    expect(list2Body.automations[0].automation.name).toBe('Link Drop v2');
    expect(list2Body.automations[0].automation.status).toBe('paused');

    // DELETE
    const del = await page.request.delete(`/api/v1/automations/${automationId}`);
    expect(del.status()).toBe(200);

    const list3 = await page.request.get('/api/v1/automations');
    const list3Body = await list3.json();
    expect(list3Body.automations).toHaveLength(0);
  });

  test('A2: igAccountId from another tenant is rejected', async ({ page }) => {
    if (!user) throw new Error('setup');

    // Create a SECOND tenant + igAccount, then try to use that
    // igAccountId while logged in as our test user.
    const otherTenantSetup = await setupTenantAndIgAccount(randomUUID());

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const result = await page.request.post('/api/v1/automations', {
      data: {
        igAccountId: otherTenantSetup.igAccountId,
        name: 'Hijack',
        keywords: ['x'],
        response: { mode: 'static', template: 'no' },
      },
    });
    expect(result.status()).toBe(403);

    // Cleanup the other tenant
    await withDb(async (c) => {
      await c.query('DELETE FROM public."tenants" WHERE "_id" = $1', [otherTenantSetup.tenantId]);
    }).catch(() => undefined);
  });

  test('A3: DM-trigger automation is creatable via /api/v1/automations (spec 015)', async ({
    page,
  }) => {
    if (!user || !igAccountId) throw new Error('setup');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    // CREATE with trigger='dm'
    const create = await page.request.post('/api/v1/automations', {
      data: {
        igAccountId,
        name: 'DM Auto Reply',
        trigger: 'dm',
        keywords: ['help', 'support'],
        matchMode: 'contains',
        response: { mode: 'static', template: 'Hi! How can I help?' },
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();
    expect(created.automation.trigger).toBe('dm');
    expect(created.trigger.keywords).toEqual(['help', 'support']);

    // LIST surfaces the trigger value
    const list = await page.request.get('/api/v1/automations');
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    expect(listBody.automations).toHaveLength(1);
    expect(listBody.automations[0].automation.trigger).toBe('dm');
  });

  test('A4: form renders the DM trigger option (spec 015 UI)', async ({ page }) => {
    if (!user) throw new Error('setup');

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    await page.goto('/app/automations/new');
    await expect(page.getByTestId('automation-form')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByTestId('trigger-selector')).toBeVisible();
    await expect(page.getByTestId('trigger-option-comment')).toBeVisible();
    await expect(page.getByTestId('trigger-option-dm')).toBeVisible();

    // Selecting DM toggles the radio (sanity — confirms client state is wired).
    await page.getByTestId('trigger-option-dm').check();
    await expect(page.getByTestId('trigger-option-dm')).toBeChecked();
  });
});
