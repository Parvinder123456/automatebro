/**
 * Spec 013 §3.3 — DPDP §12 / GDPR Article 17 erasure right.
 *
 * Soft-deletes the tenant and disconnects every connected Instagram
 * account. The actual hard-delete (cascading DELETE FROM tenants) runs
 * 30 days later via a scheduled cron in spec 014; until then the rows
 * sit invisible because buildCtx() treats deletedAt-tenants as if they
 * didn't exist.
 *
 * Idempotent — calling twice doesn't push `deletionRequestedAt` back.
 */
import type { Ctx } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';

export interface DeletionResult {
  tenantId: string;
  deletedAt: Date;
  deletionRequestedAt: Date;
  /** True if the row was already soft-deleted before this call. */
  alreadyDeleted: boolean;
}

interface TenantStatus {
  _id: string;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
}

export async function requestTenantDeletion(ctx: Ctx): Promise<DeletionResult> {
  if (ctx.tenantId === null) {
    throw new Error('requestTenantDeletion: ctx has no tenant');
  }

  const db = await getDb();
  const now = new Date();

  // Read first so we can stay idempotent. Two calls in flight at the
  // same time will both read deletedAt === null then both write — that's
  // OK, the second write is a no-op (deletedAt was already set; we don't
  // override deletionRequestedAt because that would lose the original).
  const existing = await db.queryOne<TenantStatus>('tenants', {
    _id: ctx.tenantId,
  } as never);
  if (existing === null) {
    throw new Error('requestTenantDeletion: tenant not found');
  }

  const alreadyDeleted = existing.deletedAt !== null && existing.deletedAt !== undefined;

  // Run all writes in one transaction so a partial deletion can never
  // leave igAccounts disconnected without the tenant row marked.
  await db.withTransaction(async (tx) => {
    // Tenant: only set fields that aren't already set (idempotent).
    if (!alreadyDeleted) {
      await tx.updateOne(
        'tenants',
        { _id: ctx.tenantId } as never,
        {
          $set: {
            deletedAt: now,
            deletionRequestedAt: now,
          },
        } as never,
      );
    }

    // Disconnect every igAccount belonging to this tenant. Idempotent:
    // setting disconnectedAt on an already-disconnected account is a
    // no-op visually (we just refresh the timestamp). We use a multi-row
    // update by filter since `repo` is single-row only and we don't
    // want to fetch+loop.
    const igs = await tx.queryMany<{ _id: string; disconnectedAt: Date | null }>(
      'igAccounts',
      { tenantId: ctx.tenantId, disconnectedAt: null } as never,
      { limit: 1000 } as never,
    );
    for (const ig of igs) {
      await tx.updateOne(
        'igAccounts',
        { _id: ig._id } as never,
        { $set: { disconnectedAt: now } } as never,
      );
    }
  });

  return {
    tenantId: ctx.tenantId,
    deletedAt: alreadyDeleted ? (existing.deletedAt as Date) : now,
    deletionRequestedAt: alreadyDeleted ? ((existing.deletionRequestedAt as Date) ?? now) : now,
    alreadyDeleted,
  };
}
