/**
 * Spec 023 / Phase 4.6 — duplicate an existing automation.
 *
 * Tenant clicks "Duplicate" on an automation row; we clone the
 * automation + its trigger + its response into three fresh rows with
 * new UUIDs. Status defaults to 'paused' so the clone doesn't
 * immediately fire — tenant edits + activates explicitly. Name gets a
 * "(copy)" suffix.
 *
 * This is the agency-tier use case: replicate one tested automation
 * across multiple IG accounts without re-typing keywords + templates.
 */
import { randomUUID } from 'node:crypto';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { getDb } from '../../db/client.js';
import { repo } from '../../db/repo.js';
import type { Automation, ResponseRecord, Trigger } from '../../types/tenant.js';

export interface DuplicateAutomationInput {
  /** The source automation id. Must belong to ctx.tenantId. */
  sourceAutomationId: string;
  /**
   * Optional: target a different IG account. Defaults to the source's
   * igAccountId. Useful for agencies cloning an automation across
   * client accounts.
   */
  igAccountId?: string;
  /** Optional override for the new name. Defaults to "<source.name> (copy)". */
  name?: string;
}

export interface DuplicateAutomationResult {
  automation: Automation;
  trigger: Trigger;
  response: ResponseRecord;
}

export async function duplicateAutomation(
  ctx: Ctx,
  input: DuplicateAutomationInput,
): Promise<DuplicateAutomationResult> {
  requireTenant(ctx);

  // Load source via repo (cross-tenant defence).
  const source = await repo.queryOne<Automation>(
    'automations',
    { _id: input.sourceAutomationId },
    ctx,
  );
  if (source === null) {
    throw new Error('source automation not found or not owned by this tenant');
  }

  const sourceTrigger = await repo.queryOne<Trigger>('triggers', { automationId: source._id }, ctx);
  const sourceResponse = await repo.queryOne<ResponseRecord>(
    'responses',
    { automationId: source._id },
    ctx,
  );

  // If source is missing its trigger / response (data inconsistency),
  // refuse to clone — we'd be creating a half-broken automation.
  if (sourceTrigger === null || sourceResponse === null) {
    throw new Error('source automation is missing its trigger or response row — refusing to clone');
  }

  // If a different igAccountId was requested, verify the target
  // account also belongs to this tenant.
  const targetIgAccountId = input.igAccountId ?? source.igAccountId;
  if (input.igAccountId !== undefined && input.igAccountId !== source.igAccountId) {
    const targetAccount = await repo.queryOne<{ _id: string }>(
      'igAccounts',
      { _id: input.igAccountId },
      ctx,
    );
    if (targetAccount === null) {
      throw new Error('target igAccountId does not belong to this tenant');
    }
  }

  const newAutomationId = randomUUID();
  const newTriggerId = randomUUID();
  const newResponseId = randomUUID();
  const now = new Date();

  // Status: 'paused' on clone. Tenant explicitly activates after
  // editing. Avoids a clone that fires on the same triggers as the
  // original (which is the "two automations both firing" footgun).
  const newAutomation: Automation = {
    _id: newAutomationId,
    tenantId: ctx.tenantId,
    igAccountId: targetIgAccountId,
    name: input.name ?? `${source.name} (copy)`,
    trigger: source.trigger,
    status: 'paused',
    createdAt: now,
    updatedAt: now,
  };
  const newTrigger: Trigger = {
    _id: newTriggerId,
    tenantId: ctx.tenantId,
    automationId: newAutomationId,
    keywords: [...sourceTrigger.keywords],
    matchMode: sourceTrigger.matchMode,
    postIds:
      sourceTrigger.postIds === null || sourceTrigger.postIds === undefined
        ? null
        : [...sourceTrigger.postIds],
    intents:
      sourceTrigger.intents === null || sourceTrigger.intents === undefined
        ? null
        : [...sourceTrigger.intents],
  };
  const newResponse: ResponseRecord = {
    _id: newResponseId,
    tenantId: ctx.tenantId,
    automationId: newAutomationId,
    mode: sourceResponse.mode,
    template: sourceResponse.template ?? null,
    aiPrompt: sourceResponse.aiPrompt ?? null,
    aiTone: sourceResponse.aiTone ?? null,
    fallbackTemplate: sourceResponse.fallbackTemplate ?? null,
    commentReply: sourceResponse.commentReply ?? null,
  };

  const db = await getDb();
  await db.withTransaction(async (tx) => {
    await tx.insertOne('automations', newAutomation as never);
    await tx.insertOne('triggers', newTrigger as never);
    await tx.insertOne('responses', newResponse as never);
  });

  return { automation: newAutomation, trigger: newTrigger, response: newResponse };
}
