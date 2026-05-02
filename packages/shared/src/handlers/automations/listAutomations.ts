/**
 * Spec 007 — list a tenant's automations with their triggers + responses.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { Automation, ResponseRecord, Trigger } from '../../types/tenant.js';

export interface AutomationDetail {
  automation: Automation;
  trigger: Trigger | null;
  response: ResponseRecord | null;
}

export async function listAutomations(ctx: Ctx): Promise<AutomationDetail[]> {
  const automations = await repo.queryMany<Automation>('automations', {}, ctx, { limit: 100 });
  const result: AutomationDetail[] = [];
  for (const automation of automations) {
    const trigger = await repo.queryOne<Trigger>('triggers', { automationId: automation._id }, ctx);
    const response = await repo.queryOne<ResponseRecord>(
      'responses',
      { automationId: automation._id },
      ctx,
    );
    result.push({ automation, trigger, response });
  }
  return result;
}
