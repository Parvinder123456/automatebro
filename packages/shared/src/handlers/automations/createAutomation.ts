/**
 * Spec 007 — create an automation (1 automation + 1 trigger + 1 response).
 *
 * For v1 these are 1:1 and atomic — a transaction inserts all three
 * rows or none. The Zod schema validates the shape; FK checks ensure
 * the igAccountId belongs to this tenant.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
import type { Automation, ResponseRecord, Trigger } from '../../types/tenant.js';

export const CreateAutomationInput = z.object({
  igAccountId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  // Spec 015 — `dm` added so an automation can fire on inbound DMs.
  trigger: z.enum(['comment', 'dm', 'storyReply', 'mention']).default('comment'),
  status: z.enum(['active', 'paused', 'archived']).default('active'),
  keywords: z.array(z.string().trim().min(1)).min(1).max(50),
  matchMode: z.enum(['contains', 'exact', 'startsWith']).default('contains'),
  postIds: z.array(z.string().min(1)).max(500).optional(),
  response: z.object({
    mode: z.enum(['static', 'ai']).default('static'),
    template: z.string().min(1).max(2000).nullable().optional(),
    aiPrompt: z.string().max(2000).nullable().optional(),
    aiTone: z.enum(['friendly', 'professional', 'playful']).nullable().optional(),
    fallbackTemplate: z.string().max(2000).nullable().optional(),
    commentReply: z.string().max(2000).nullable().optional(),
  }),
});
export type CreateAutomationInputType = z.infer<typeof CreateAutomationInput>;

export interface CreateAutomationResult {
  automation: Automation;
  trigger: Trigger;
  response: ResponseRecord;
}

export async function createAutomation(
  input: CreateAutomationInputType,
  ctx: Ctx,
): Promise<CreateAutomationResult> {
  requireTenant(ctx);
  const db = await getDb();

  // Verify igAccountId belongs to this tenant.
  const igAcct = await db.queryOne<{ _id: string }>('igAccounts', {
    _id: input.igAccountId,
    tenantId: ctx.tenantId,
  } as never);
  if (igAcct === null) {
    throw new Error('igAccountId does not belong to this tenant');
  }

  const automationId = randomUUID();
  const triggerId = randomUUID();
  const responseId = randomUUID();
  const now = new Date();

  const automation: Automation = {
    _id: automationId,
    tenantId: ctx.tenantId,
    igAccountId: input.igAccountId,
    name: input.name,
    trigger: input.trigger,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  const trigger: Trigger = {
    _id: triggerId,
    tenantId: ctx.tenantId,
    automationId,
    keywords: input.keywords,
    matchMode: input.matchMode,
    postIds: input.postIds ?? null,
  };
  const responseRow: ResponseRecord = {
    _id: responseId,
    tenantId: ctx.tenantId,
    automationId,
    mode: input.response.mode,
    template: input.response.template ?? null,
    aiPrompt: input.response.aiPrompt ?? null,
    aiTone: input.response.aiTone ?? null,
    fallbackTemplate: input.response.fallbackTemplate ?? null,
    commentReply: input.response.commentReply ?? null,
  };

  await db.withTransaction(async (tx) => {
    await tx.insertOne('automations', automation as never);
    await tx.insertOne('triggers', trigger as never);
    await tx.insertOne('responses', responseRow as never);
  });

  return { automation, trigger, response: responseRow };
}
