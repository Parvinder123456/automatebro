/**
 * Spec 026 — list WhatsApp templates for the current tenant.
 *
 * Returns a UI-safe summary including status badges. Mirror of
 * `listWhatsappAccounts` shape.
 */
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { WhatsappTemplate } from '../../types/tenant.js';

export interface WhatsappTemplateSummary {
  _id: string;
  whatsappAccountId: string;
  name: string;
  category: WhatsappTemplate['category'];
  language: string;
  bodyText: string;
  footerText: string | null;
  variableCount: number;
  status: WhatsappTemplate['status'];
  metaTemplateId: string | null;
  rejectionReason: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(t: WhatsappTemplate): WhatsappTemplateSummary {
  return {
    _id: t._id,
    whatsappAccountId: t.whatsappAccountId,
    name: t.name,
    category: t.category,
    language: t.language,
    bodyText: t.bodyText,
    footerText: t.footerText ?? null,
    variableCount: t.variableCount,
    status: t.status,
    metaTemplateId: t.metaTemplateId ?? null,
    rejectionReason: t.rejectionReason ?? null,
    submittedAt: t.submittedAt ?? null,
    approvedAt: t.approvedAt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function listWhatsappTemplates(ctx: Ctx): Promise<WhatsappTemplateSummary[]> {
  requireTenant(ctx);
  const rows = await repo.queryMany<WhatsappTemplate>('whatsappTemplates', {}, ctx, {
    limit: 200,
    sort: { updatedAt: -1 } as never,
  });
  return rows.map(toSummary);
}

/**
 * Convenience: only approved templates, used by the automation form to
 * populate the response-template selector.
 */
export async function listApprovedWhatsappTemplates(
  ctx: Ctx,
  whatsappAccountId: string,
): Promise<WhatsappTemplateSummary[]> {
  requireTenant(ctx);
  const rows = await repo.queryMany<WhatsappTemplate>(
    'whatsappTemplates',
    { whatsappAccountId, status: 'approved' },
    ctx,
    { limit: 200, sort: { updatedAt: -1 } as never },
  );
  return rows.map(toSummary);
}
