/**
 * Spec 011 §5.1 — tenant-scoped lead count for the dashboard summary.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';

export async function countLeads(ctx: Ctx): Promise<number> {
  return repo.count('leads', {}, ctx);
}
