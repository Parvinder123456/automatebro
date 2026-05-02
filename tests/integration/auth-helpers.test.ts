/**
 * Spec 002 §10.2 — Supabase Auth integration tests.
 *
 * I1: admin createUser then deleteUser smoke
 * I2: signin with correct password returns a session
 * I3: signin with wrong password returns AuthApiError
 * I4: unverified user cannot sign in
 *
 * REQUIRES: real SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY.
 * Skipped if not set so a clean clone passes.
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasInfra = Boolean(
  process.env.SUPABASE_URL &&
    process.env.SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TEST_DOMAIN = '@automatebro.test';

function adminClient() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function browserClient() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_ANON_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const createdUserIds: string[] = [];

describe.skipIf(!hasInfra)('Supabase Auth admin + signin (integration)', () => {
  beforeAll(() => {
    if (!hasInfra) return;
    // sanity
    expect(process.env.SUPABASE_URL).toMatch(/supabase\.co/);
  });

  afterAll(async () => {
    if (!hasInfra) return;
    const admin = adminClient();
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  it('I1: admin createUser → deleteUser round-trips cleanly', async () => {
    const admin = adminClient();
    const email = `i1+${Date.now()}${TEST_DOMAIN}`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'S3curepass!word',
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user).not.toBeNull();
    if (data.user === null) throw new Error('no user');

    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    expect(deleteError).toBeNull();
  });

  it('I2: signin with correct password returns a session', async () => {
    const admin = adminClient();
    const email = `i2+${Date.now()}${TEST_DOMAIN}`;
    const password = 'S3curepass!word';

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    if (created.user === null) throw new Error('no user');
    createdUserIds.push(created.user.id);

    const { data: signin, error: signinErr } = await browserClient().auth.signInWithPassword({
      email,
      password,
    });
    expect(signinErr).toBeNull();
    expect(signin.session).not.toBeNull();
    expect(signin.session?.access_token).toBeTruthy();
  });

  it('I3: signin with wrong password returns invalid_credentials error', async () => {
    const admin = adminClient();
    const email = `i3+${Date.now()}${TEST_DOMAIN}`;
    const password = 'S3curepass!word';

    const { data: created } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.user === null) throw new Error('no user');
    createdUserIds.push(created.user.id);

    const { data, error } = await browserClient().auth.signInWithPassword({
      email,
      password: 'WRONG-PASSWORD',
    });
    expect(error).not.toBeNull();
    expect(error?.code === 'invalid_credentials' || /invalid/i.test(error?.message ?? '')).toBe(
      true,
    );
    expect(data.session).toBeNull();
  });

  it('I4: unverified user cannot sign in', async () => {
    const admin = adminClient();
    const email = `i4+${Date.now()}${TEST_DOMAIN}`;
    const password = 'S3curepass!word';

    // email_confirm: false → user exists but is unverified.
    const { data: created } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });
    if (created.user === null) throw new Error('no user');
    createdUserIds.push(created.user.id);

    const { data, error } = await browserClient().auth.signInWithPassword({ email, password });
    expect(error).not.toBeNull();
    // Supabase returns one of: email_not_confirmed, invalid_credentials,
    // depending on project config. Either confirms the unverified path.
    expect(data.session).toBeNull();
  });
});

describe.skipIf(hasInfra)('Supabase Auth integration (no infra)', () => {
  it('skipped: SUPABASE_* env not set', () => {
    expect(true).toBe(true);
  });
});
