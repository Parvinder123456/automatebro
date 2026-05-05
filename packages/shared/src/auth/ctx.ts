/**
 * Spec 003 — server-side request context.
 *
 * `Ctx` carries the trust-bound identity for the current request. It is
 * computed from the Supabase Auth session and the user's tenantUsers
 * row. Handlers receive `ctx` from this module — they NEVER read tenant
 * or user identifiers from request headers / bodies, which are
 * attacker-controlled.
 *
 * `getCtx()` is the only place where:
 *   - The Supabase Auth user is mirrored into public.users (lazy,
 *     idempotent via $setOnInsert).
 *   - The tenantUsers row is resolved into ctx.tenantId / ctx.role.
 *
 * Usage from a Server Component or Route Handler:
 *
 *   const ctx = await getCtx();
 *   if (ctx === null) redirect('/login');
 *   if (ctx.tenantId === null) redirect('/onboarding');
 *   const automations = await repo.queryMany('automations', {}, ctx);
 */
import type { StrictDB } from 'strictdb';
import { getDb } from '../db/client.js';
import type { Role } from '../types/tenant.js';

export interface Ctx {
  userId: string;
  /** null while the user is in onboarding (no tenantUsers row yet). */
  tenantId: string | null;
  /** null while the user is in onboarding. */
  role: Role | null;
  email: string;
  /**
   * Spec 013 — true when the user has a tenantUsers row but the tenant
   * has `deletedAt !== null`. The (app) layout uses this to send the
   * user to /deleted instead of /onboarding (both have tenantId === null
   * but the UX is different: pre-tenant vs post-deletion).
   */
  tenantDeleted: boolean;
}

export interface SupabaseAuthUser {
  id: string;
  email: string | undefined;
  user_metadata?: { name?: string | null } | null;
}

interface TenantUserRow {
  tenantId: string;
  role: Role;
}

interface TenantStatusRow {
  _id: string;
  deletedAt: Date | null;
}

/**
 * Build `Ctx` for a given Supabase Auth user. Mirrors the user into
 * public.users on first call; resolves tenantUsers; returns the
 * shaped context.
 *
 * Exposed as a parameterised function (not just `getCtx()`) so tests
 * can inject a fake user without spinning up Supabase Auth.
 */
export async function buildCtx(user: SupabaseAuthUser, db: StrictDB): Promise<Ctx> {
  const email = user.email ?? '';

  // Mirror lazy + idempotent. Postgres unique constraint on users._id
  // prevents duplicates if two requests race. We use $set for the email
  // (cheap to refresh; harmless if it's identical) AND $setOnInsert for
  // the immutable fields. StrictDB requires at least one of $set/$inc/$unset
  // to be present in the update operator object, so $set covers that
  // requirement.
  // StrictDB's type narrowing requires concrete schemas to be referenced
  // by name; casting through `as never` keeps the narrow filter / update
  // unions happy without weakening runtime validation (Zod still checks).
  await db.updateOne(
    'users',
    { _id: user.id },
    {
      $set: { email },
      $setOnInsert: {
        _id: user.id,
        name: user.user_metadata?.name ?? null,
        createdAt: new Date(),
      },
    } as never,
    true, // upsert
  );

  const tu = await db.queryOne<TenantUserRow>('tenantUsers', {
    userId: user.id,
  } as never);

  // Spec 013 — soft-deleted tenants are invisible to their users. We
  // join to `tenants` and treat `deletedAt !== null` as "no tenant"
  // so the user is bounced to /deleted by the (app) layout. Until the
  // 30-day hard-delete cron fires (spec 014), the tenantUsers row
  // sticks around so an operator can un-delete via direct DB access.
  let tenantId: string | null = tu?.tenantId ?? null;
  let role: Role | null = tu?.role ?? null;
  let tenantDeleted = false;
  if (tu !== null && tu.tenantId !== undefined) {
    const tenant = await db.queryOne<TenantStatusRow>('tenants', {
      _id: tu.tenantId,
    } as never);
    if (tenant === null || (tenant.deletedAt !== null && tenant.deletedAt !== undefined)) {
      tenantId = null;
      role = null;
      tenantDeleted = tenant !== null;
    }
  }

  return {
    userId: user.id,
    tenantId,
    role,
    email,
    tenantDeleted,
  };
}

/** Asserts ctx has a tenant. Used by handlers that require multi-tenant context. */
export function requireTenant(ctx: Ctx): asserts ctx is Ctx & { tenantId: string; role: Role } {
  if (ctx.tenantId === null || ctx.role === null) {
    throw new Error('requireTenant: ctx has no tenantId — caller is in onboarding state');
  }
}

/**
 * High-level helper for Server Components / Route Handlers in
 * apps/web. Delegates to a Supabase-Auth-aware client adapter
 * provided at the call site, since this package can't import Next.js
 * @supabase/ssr cookie helpers without dragging Next into the shared
 * workspace.
 */
export async function getCtxFromUser(user: SupabaseAuthUser | null): Promise<Ctx | null> {
  if (user === null) return null;
  const db = await getDb();
  return buildCtx(user, db);
}
