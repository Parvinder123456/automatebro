/**
 * Spec 003 §10.4 — getCtx tests via the framework-agnostic
 * buildCtx() / getCtxFromUser() entrypoints.
 */
import { randomUUID } from 'node:crypto';
import { buildCtx, getCtxFromUser } from '@automatebro/shared/auth/ctx';
import { getDb } from '@automatebro/shared/db/client';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe.skipIf(!hasInfra)('getCtx / buildCtx (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  it('C1: user with no tenant → ctx.tenantId === null AND user is mirrored', async () => {
    const a = admin();
    const email = `ctx-c1-${Date.now()}@automatebro.test`;
    const { data, error } = await a.auth.admin.createUser({
      email,
      password: 'S3curepass!word',
      email_confirm: true,
    });
    if (error !== null || data.user === null) throw new Error('createUser failed');
    const userId = data.user.id;
    cleanup.push(async () => {
      const db = await getDb();
      await db.deleteOne('users', { _id: userId }).catch(() => undefined);
      await a.auth.admin.deleteUser(userId).catch(() => undefined);
    });

    const db = await getDb();
    const ctx = await buildCtx({ id: userId, email, user_metadata: { name: 'Test User' } }, db);

    expect(ctx.userId).toBe(userId);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.role).toBeNull();
    expect(ctx.email).toBe(email);

    const mirrored = await db.queryOne<{ _id: string; email: string }>('users', { _id: userId });
    expect(mirrored).not.toBeNull();
    expect(mirrored?.email).toBe(email);
  });

  it('C2: mirror is idempotent — calling buildCtx twice does not duplicate', async () => {
    const a = admin();
    const email = `ctx-c2-${Date.now()}@automatebro.test`;
    const { data } = await a.auth.admin.createUser({
      email,
      password: 'S3curepass!word',
      email_confirm: true,
    });
    if (data.user === null) throw new Error('createUser failed');
    const userId = data.user.id;
    cleanup.push(async () => {
      const db = await getDb();
      await db.deleteOne('users', { _id: userId }).catch(() => undefined);
      await a.auth.admin.deleteUser(userId).catch(() => undefined);
    });

    const db = await getDb();
    await buildCtx({ id: userId, email, user_metadata: null }, db);
    await buildCtx({ id: userId, email, user_metadata: null }, db);

    const count = await db.count('users', { _id: userId });
    expect(count).toBe(1);
  });

  it('C3: user with tenant → ctx.tenantId resolved', async () => {
    const a = admin();
    const email = `ctx-c3-${Date.now()}@automatebro.test`;
    const { data } = await a.auth.admin.createUser({
      email,
      password: 'S3curepass!word',
      email_confirm: true,
    });
    if (data.user === null) throw new Error('createUser failed');
    const userId = data.user.id;
    const tenantId = randomUUID();
    cleanup.push(async () => {
      const db = await getDb();
      await db.deleteOne('tenants', { _id: tenantId }).catch(() => undefined);
      await db.deleteOne('users', { _id: userId }).catch(() => undefined);
      await a.auth.admin.deleteUser(userId).catch(() => undefined);
    });

    const db = await getDb();
    await db.insertOne('users', { _id: userId, email, name: null, createdAt: new Date() });
    await db.insertOne('tenants', {
      _id: tenantId,
      name: 'C3 Workspace',
      slug: `c3-${Math.random().toString(36).slice(2, 8)}`,
      plan: 'free',
      createdAt: new Date(),
    });
    await db.insertOne('tenantUsers', {
      _id: randomUUID(),
      tenantId,
      userId,
      role: 'owner',
      acceptedAt: new Date(),
    });

    const ctx = await buildCtx({ id: userId, email, user_metadata: null }, db);
    expect(ctx.tenantId).toBe(tenantId);
    expect(ctx.role).toBe('owner');
  });

  it('C4: getCtxFromUser(null) returns null', async () => {
    const ctx = await getCtxFromUser(null);
    expect(ctx).toBeNull();
  });
});

describe.skipIf(hasInfra)('getCtx (no infra)', () => {
  it('skipped: SUPABASE_* not set', () => {
    expect(true).toBe(true);
  });
});
