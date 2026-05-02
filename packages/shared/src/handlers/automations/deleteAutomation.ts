/**
 * Spec 007 — delete an automation. SQL FK cascades drop the trigger
 * and response rows automatically (ON DELETE CASCADE).
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';

export async function deleteAutomation(automationId: string, ctx: Ctx): Promise<boolean> {
  await repo.deleteOne('automations', { _id: automationId }, ctx);
  return true;
}
