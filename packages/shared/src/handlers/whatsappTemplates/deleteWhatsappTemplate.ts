/**
 * Spec 026 — delete (or soft-disable) a WhatsApp template.
 *
 * Two cases:
 *   - status='draft': hard-delete the row (never submitted to Meta;
 *     no audit value in keeping it).
 *   - any other status: set status='disabled'. Meta-side template
 *     persists (Meta's deletion API exists but we don't call it in v1
 *     to preserve audit trail).
 */
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { WhatsappTemplate } from '../../types/tenant.js';

export interface DeleteWhatsappTemplateInput {
  whatsappTemplateId: string;
}

export interface DeleteWhatsappTemplateResult {
  ok: true;
  mode: 'hard-deleted' | 'disabled';
}

export async function deleteWhatsappTemplate(
  input: DeleteWhatsappTemplateInput,
  ctx: Ctx,
): Promise<DeleteWhatsappTemplateResult> {
  requireTenant(ctx);

  const existing = await repo.queryOne<WhatsappTemplate>(
    'whatsappTemplates',
    { _id: input.whatsappTemplateId },
    ctx,
  );
  if (existing === null) {
    throw new Error(
      `deleteWhatsappTemplate: no template ${input.whatsappTemplateId} for current tenant`,
    );
  }

  if (existing.status === 'draft') {
    await repo.deleteOne('whatsappTemplates', { _id: input.whatsappTemplateId }, ctx);
    return { ok: true, mode: 'hard-deleted' };
  }

  await repo.updateOne(
    'whatsappTemplates',
    { _id: input.whatsappTemplateId },
    { $set: { status: 'disabled', updatedAt: new Date() } },
    ctx,
  );
  return { ok: true, mode: 'disabled' };
}
