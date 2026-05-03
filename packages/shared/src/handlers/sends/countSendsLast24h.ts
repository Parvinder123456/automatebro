/**
 * Spec 011 §5.1 — count sends queued in the last 24 hours.
 *
 * Used by the dashboard summary card. Tenant-scoped via repo.count.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function countSendsLast24h(ctx: Ctx): Promise<number> {
  const cutoff = new Date(Date.now() - ONE_DAY_MS);
  return repo.count('sends', { queuedAt: { $gte: cutoff } }, ctx);
}
