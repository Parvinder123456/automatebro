/**
 * Spec 009 — leads E2E.
 *
 * Tests:
 *   L1: GET /api/v1/leads returns the tenant's leads
 *   L2: GET /api/v1/leads?format=csv returns text/csv with header + rows
 *   L3: cross-tenant isolation — tenant B can't see tenant A's leads
 *
 * Inserts leads directly via SQL (the captureLead handler is exercised
 * unit-style in integration tests; here we test the read path).
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

async function setupTenantWithLeads(
  userId: string,
  leadCount: number,
): Promise<{ tenantId: string; igAccountId: string; leadIds: string[] }> {
  const tenantId = randomUUID();
  const igAccountId = randomUUID();
  const leadIds: string[] = [];

  await withDb(async (c) => {
    await c.query(
      'INSERT INTO public."users" ("_id", "email", "createdAt") VALUES ($1, $2, now()) ON CONFLICT ("_id") DO NOTHING',
      [userId, `${userId}@example.test`],
    );
    await c.query(
      'INSERT INTO public."tenants" ("_id", "name", "slug", "plan", "createdAt") VALUES ($1, $2, $3, $4, now())',
      [tenantId, 'Lead Test', `lead-${tenantId.slice(0, 8)}`, 'free'],
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
        'studio_lead_test',
        `page-${igAccountId.slice(0, 8)}`,
        'Test Page',
        randomBytes(32),
        randomBytes(12),
        randomBytes(16),
        1,
        ['instagram_basic'],
      ],
    );

    for (let i = 0; i < leadCount; i++) {
      const leadId = randomUUID();
      leadIds.push(leadId);
      await c.query(
        `INSERT INTO public."leads"
          ("_id", "tenantId", "igAccountId", "igUserId", "igUsername", "email", "phone",
           "firstSeenAt", "lastSeenAt", "tags", "attributedAutomationId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), $8, NULL)`,
        [
          leadId,
          tenantId,
          igAccountId,
          `psid-${i}-${randomUUID().slice(0, 8)}`,
          `user_${i}`,
          `lead${i}@example.test`,
          `+91999900000${i}`,
          ['e2e-fixture'],
        ],
      );
    }
  });

  return { tenantId, igAccountId, leadIds };
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

test.describe('leads endpoint (integration)', () => {
  test.skip(skipReason !== null, skipReason ?? '');

  let user: TestUser | null = null;

  test.beforeEach(async () => {
    user = await createTestUser('e2e-leads');
  });

  test.afterEach(async () => {
    if (user) {
      await cleanup(user.userId);
      await deleteTestUser(user.userId);
    }
    user = null;
  });

  test("L1: GET /api/v1/leads returns the tenant's leads", async ({ page }) => {
    if (!user) throw new Error('setup');
    await setupTenantWithLeads(user.userId, 3);

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const response = await page.request.get('/api/v1/leads');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.leads).toHaveLength(3);
    expect(body.leads[0].email).toMatch(/lead\d@example\.test/);
    expect(body.leads[0].phone).toMatch(/^\+91/);
  });

  test('L2: ?format=csv returns text/csv with header + rows', async ({ page }) => {
    if (!user) throw new Error('setup');
    await setupTenantWithLeads(user.userId, 2);

    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/app\/dashboard$/, {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });

    const response = await page.request.get('/api/v1/leads?format=csv');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(response.headers()['content-disposition']).toContain('attachment');
    const text = await response.text();
    expect(text).toMatch(/^igUserId,igUsername,email,phone,firstSeenAt,lastSeenAt,tags/);
    // Header + 2 rows + trailing CRLF.
    const lines = text.trim().split(/\r\n/);
    expect(lines).toHaveLength(3);
  });

  test('L3: tenant B cannot see tenant A leads', async ({ browser }) => {
    if (!user) throw new Error('setup');
    await setupTenantWithLeads(user.userId, 5);

    // Create a second user/tenant with no leads.
    const userB = await createTestUser('e2e-leads-B');
    await setupTenantWithLeads(userB.userId, 0);
    try {
      const ctxB = await browser.newContext();
      const pageB = await ctxB.newPage();
      await pageB.goto('/login');
      await pageB.waitForLoadState('networkidle');
      await pageB.getByLabel('Email').fill(userB.email);
      await pageB.getByLabel('Password').fill(userB.password);
      await pageB.getByTestId('login-submit').click();
      await pageB.waitForURL(/\/app\/dashboard$/, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });

      const response = await pageB.request.get('/api/v1/leads');
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.leads).toHaveLength(0);

      await ctxB.close();
    } finally {
      await cleanup(userB.userId);
      await deleteTestUser(userB.userId);
    }
  });
});
