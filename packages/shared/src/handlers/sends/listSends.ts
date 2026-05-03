/**
 * Spec 011 §3.4 — list a tenant's outbound sends.
 *
 * Tenant-scoped via repo. Sort: queuedAt DESC. Default limit 1000,
 * max 5000 (matches the existing /api/v1/leads cap).
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { Send } from '../../types/tenant.js';

export interface ListSendsOptions {
  status?: 'queued' | 'sent' | 'failed' | 'rateLimited' | 'outsideWindow';
  igAccountId?: string;
  automationId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function listSends(ctx: Ctx, opts: ListSendsOptions = {}): Promise<Send[]> {
  const filter: Record<string, unknown> = {};
  if (opts.status !== undefined) filter.status = opts.status;
  if (opts.igAccountId !== undefined) filter.igAccountId = opts.igAccountId;
  if (opts.automationId !== undefined) filter.automationId = opts.automationId;
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  return repo.queryMany<Send>('sends', filter, ctx, {
    limit,
    sort: { queuedAt: -1 } as never,
  });
}
