/**
 * Spec 003 — integration-test fixtures for creating test tenants.
 *
 * Creates a Supabase Auth user, mirrors them into public.users, then
 * creates a tenant and tenantUsers binding. Returns everything needed
 * to reason about the fixture in tests + a cleanup function.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@automatebro/shared/db/client';
import { slugify } from '@automatebro/shared/db/schema';
import type { Role } from '@automatebro/shared/types/tenant';
import { createClient } from '@supabase/supabase-js';

const TEST_DOMAIN = '@automatebro.test';

export interface TestTenantFixture {
  userId: string;
  tenantId: string;
  email: string;
  slug: string;
  cleanup: () => Promise<void>;
}

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestTenant(
  prefix = 'test',
  role: Role = 'owner',
): Promise<TestTenantFixture> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${TEST_DOMAIN}`;
  const a = admin();
  const { data: createdAuth, error: authErr } = await a.auth.admin.createUser({
    email,
    password: 'S3curepass!word',
    email_confirm: true,
  });
  if (authErr !== null) throw new Error(`createTestTenant auth: ${authErr.message}`);
  if (createdAuth.user === null) throw new Error('createTestTenant: no auth user');
  const userId = createdAuth.user.id;

  const db = await getDb();
  const tenantId = randomUUID();
  const slug = slugify(`${prefix} fixture`, randomBytes(3).toString('hex'));
  const now = new Date();

  await db.insertOne('users', { _id: userId, email, name: null, createdAt: now });
  await db.insertOne('tenants', {
    _id: tenantId,
    name: `${prefix} fixture`,
    slug,
    plan: 'free',
    createdAt: now,
  });
  await db.insertOne('tenantUsers', {
    _id: randomUUID(),
    tenantId,
    userId,
    role,
    acceptedAt: now,
  });

  const cleanup = async (): Promise<void> => {
    // FK cascade from tenants → tenant_users; we still need to clean
    // users + auth.users manually.
    try {
      await db.deleteOne('tenants', { _id: tenantId });
      await db.deleteOne('users', { _id: userId });
    } catch {
      // best-effort
    }
    try {
      await a.auth.admin.deleteUser(userId);
    } catch {
      // best-effort
    }
  };

  return { userId, tenantId, email, slug, cleanup };
}
