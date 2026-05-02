/**
 * Spec 007 — update an automation. Only mutable fields: name, status,
 * keywords, matchMode, response template/AI fields.
 */
import { z } from 'zod';
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';

export const UpdateAutomationInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  keywords: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
  matchMode: z.enum(['contains', 'exact', 'startsWith']).optional(),
  postIds: z.array(z.string().min(1)).max(500).nullable().optional(),
  response: z
    .object({
      mode: z.enum(['static', 'ai']).optional(),
      template: z.string().max(2000).nullable().optional(),
      aiPrompt: z.string().max(2000).nullable().optional(),
      aiTone: z.enum(['friendly', 'professional', 'playful']).nullable().optional(),
      fallbackTemplate: z.string().max(2000).nullable().optional(),
      commentReply: z.string().max(2000).nullable().optional(),
    })
    .optional(),
});
export type UpdateAutomationInputType = z.infer<typeof UpdateAutomationInput>;

export async function updateAutomation(
  automationId: string,
  input: UpdateAutomationInputType,
  ctx: Ctx,
): Promise<boolean> {
  const automationFields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) automationFields.name = input.name;
  if (input.status !== undefined) automationFields.status = input.status;

  const triggerFields: Record<string, unknown> = {};
  if (input.keywords !== undefined) triggerFields.keywords = input.keywords;
  if (input.matchMode !== undefined) triggerFields.matchMode = input.matchMode;
  if (input.postIds !== undefined) triggerFields.postIds = input.postIds;

  // updateOne returns truthy on update or no-op (nothing matched).
  await repo.updateOne('automations', { _id: automationId }, { $set: automationFields }, ctx);
  if (Object.keys(triggerFields).length > 0) {
    await repo.updateOne('triggers', { automationId }, { $set: triggerFields }, ctx);
  }
  if (input.response !== undefined) {
    await repo.updateOne('responses', { automationId }, { $set: input.response }, ctx);
  }
  return true;
}
