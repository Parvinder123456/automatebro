/**
 * Spec 007 — list a tenant's automations with their triggers + responses.
 * Spec 020 / Phase 2.3 — paginated.
 */
import type { Ctx } from '../../auth/ctx.js';
import { type Paginated, paginate } from '../../db/pagination.js';
import { repo } from '../../db/repo.js';
import type { Automation, ResponseRecord, Trigger } from '../../types/tenant.js';

export interface AutomationDetail {
  automation: Automation;
  trigger: Trigger | null;
  response: ResponseRecord | null;
}

export interface ListAutomationsOptions {
  page?: number;
  pageSize?: number;
}

export async function listAutomations(
  ctx: Ctx,
  opts: ListAutomationsOptions = {},
): Promise<Paginated<AutomationDetail>> {
  const paginateOpts: Parameters<typeof paginate<Automation>>[3] = {
    sort: { createdAt: -1 },
  };
  if (opts.page !== undefined) paginateOpts.page = opts.page;
  if (opts.pageSize !== undefined) paginateOpts.pageSize = opts.pageSize;
  const automations = await paginate<Automation>('automations', {}, ctx, paginateOpts);

  // Hydrate triggers + responses for the page rows. We hydrate in
  // parallel via Promise.all (Critical Rule #8) — N small queries
  // against indexed columns, all independent.
  const items: AutomationDetail[] = await Promise.all(
    automations.items.map(async (automation) => {
      const [trigger, response] = await Promise.all([
        repo.queryOne<Trigger>('triggers', { automationId: automation._id }, ctx),
        repo.queryOne<ResponseRecord>('responses', { automationId: automation._id }, ctx),
      ]);
      return { automation, trigger, response };
    }),
  );

  return { ...automations, items };
}
