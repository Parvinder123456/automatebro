/**
 * E2E test fixture helpers — manage Supabase Auth users via the admin
 * API. Tests create users with email_confirm: true so they bypass the
 * email-link verification step (which would require inbox access).
 *
 * Usage:
 *   const { email, password, userId } = await createTestUser();
 *   // ... do test things ...
 *   await deleteTestUser(userId);
 */
import { createClient } from '@supabase/supabase-js';

export interface TestUser {
  email: string;
  password: string;
  userId: string;
}

const TEST_PASSWORD = 'S3curepass!word';
const TEST_DOMAIN = '@automatebro.test';

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createTestUser(prefix = 'e2e'): Promise<TestUser> {
  const email = `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}${TEST_DOMAIN}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw new Error(`createTestUser failed: ${error.message}`);
  if (data.user === null) throw new Error('createTestUser returned null user');
  return { email, password: TEST_PASSWORD, userId: data.user.id };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await admin()
    .auth.admin.deleteUser(userId)
    .catch(() => undefined);
}
