/**
 * Spec 003 — handler that turns "user submits workspace name" into
 * three coordinated DB writes:
 *   1. tenants row (new)
 *   2. users row (idempotent — already mirrored by getCtx, but we
 *      $setOnInsert here too for the rare case where the route is
 *      called before getCtx warmed the cache)
 *   3. tenantUsers row (binds user → tenant with role 'owner')
 *
 * Only callable while the user is in onboarding (no existing tenant).
 * Returns 409 from the route if the user already has a tenant.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
import { slugify } from '../../db/schema.js';
import type { Tenant, TenantUser } from '../../types/tenant.js';

export const CreateTenantInput = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CreateTenantInputType = z.infer<typeof CreateTenantInput>;

export interface CreateTenantResult {
  tenant: Tenant;
  membership: TenantUser;
}

/**
 * Pre-condition: ctx.tenantId === null (otherwise the route returns 409
 * before calling this).
 *
 * Atomicity: StrictDB's batch semantics on Postgres run in a single
 * transaction. If any of the three writes fail, none are persisted.
 */
export async function createTenant(
  input: CreateTenantInputType,
  ctx: Ctx,
): Promise<CreateTenantResult> {
  const db = await getDb();
  const now = new Date();
  const tenantId = randomUUID();
  const membershipId = randomUUID();
  const slug = slugify(input.name, randomBytes(3).toString('hex'));

  const tenant: Tenant = {
    _id: tenantId,
    name: input.name,
    slug,
    plan: 'free',
    dpdpConsentAt: now,
    createdAt: now,
    deletedAt: null,
  };

  const membership: TenantUser = {
    _id: membershipId,
    tenantId,
    userId: ctx.userId,
    role: 'owner',
    invitedAt: null,
    acceptedAt: now,
  };

  // users row should already exist (getCtx mirrored it). We insert
  // tenants + tenantUsers atomically. db.withTransaction wraps both
  // calls in a Postgres BEGIN/COMMIT — if either fails, neither
  // persists. db.batch does NOT do this (sequential, not transactional)
  // so we use withTransaction for true atomicity.
  await db.withTransaction(async (tx) => {
    await tx.insertOne('tenants', tenant as never);
    await tx.insertOne('tenantUsers', membership as never);
  });

  return { tenant, membership };
}

/**
 * Returns true if the user already has a tenant. Used by the route to
 * short-circuit duplicate onboarding.
 */
export async function hasExistingTenant(ctx: Ctx): Promise<boolean> {
  const db = await getDb();
  const existing = await db.queryOne('tenantUsers', { userId: ctx.userId });
  return existing !== null;
}
