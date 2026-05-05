/**
 * Spec 011 §3.4 — list a tenant's outbound sends.
 * Spec 020 / Phase 2.3 — paginated.
 *
 * Tenant-scoped via repo. Sort: queuedAt DESC. Page is 1-indexed.
 */
import type { Ctx } from '../../auth/ctx.js';
import { type Paginated, paginate } from '../../db/pagination.js';
import type { Send } from '../../types/tenant.js';

export interface ListSendsOptions {
  status?: 'queued' | 'sent' | 'failed' | 'rateLimited' | 'outsideWindow';
  igAccountId?: string;
  automationId?: string;
  page?: number;
  pageSize?: number;
  /** Back-compat shim — treated as pageSize. */
  limit?: number;
}

export async function listSends(ctx: Ctx, opts: ListSendsOptions = {}): Promise<Paginated<Send>> {
  const filter: Record<string, unknown> = {};
  if (opts.status !== undefined) filter.status = opts.status;
  if (opts.igAccountId !== undefined) filter.igAccountId = opts.igAccountId;
  if (opts.automationId !== undefined) filter.automationId = opts.automationId;

  const paginateOpts: Parameters<typeof paginate<Send>>[3] = { sort: { queuedAt: -1 } };
  if (opts.page !== undefined) paginateOpts.page = opts.page;
  const pageSize = opts.pageSize ?? opts.limit;
  if (pageSize !== undefined) paginateOpts.pageSize = pageSize;
  return paginate<Send>('sends', filter, ctx, paginateOpts);
}
