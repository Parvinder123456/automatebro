/**
 * Spec 004 — disconnect an Instagram account.
 *
 * Hard-delete the row (cascades from tenants but here is direct).
 * The encrypted token is removed; subsequent webhook deliveries from
 * Meta for this page will be received and either no-oped (no
 * matching igAccounts row → events table records orphan) or rejected.
 *
 * v1 hard-deletes; spec 013 (privacy) might soft-delete with audit trail.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';

export async function disconnectIgAccount(igAccountId: string, ctx: Ctx): Promise<boolean> {
  // repo.deleteOne enforces tenantId match; if the id belongs to a
  // different tenant, the query returns no row.
  const result = await repo.deleteOne('igAccounts', { _id: igAccountId }, ctx);
  // StrictDB returns the number deleted or a result object — we treat
  // truthiness as success since the row not existing is also "ok"
  // semantically (idempotent).
  return Boolean(result);
}
