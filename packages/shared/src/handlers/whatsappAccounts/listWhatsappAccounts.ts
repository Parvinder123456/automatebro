/**
 * Spec 026 — list connected WhatsApp accounts for the current tenant.
 *
 * Returns a UI-safe summary (no encrypted token material). Mirror of
 * `listIgAccounts`. Sorts disconnected accounts to the bottom.
 */
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { WhatsappAccount } from '../../types/tenant.js';

export interface WhatsappAccountSummary {
  _id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  messagingTier: WhatsappAccount['messagingTier'];
  qualityRating: WhatsappAccount['qualityRating'];
  dailyConversationCap: number;
  webhookSubscribedAt: Date | null;
  connectedAt: Date;
  disconnectedAt: Date | null;
}

function toSummary(a: WhatsappAccount): WhatsappAccountSummary {
  return {
    _id: a._id,
    wabaId: a.wabaId,
    phoneNumberId: a.phoneNumberId,
    displayPhoneNumber: a.displayPhoneNumber,
    verifiedName: a.verifiedName ?? null,
    messagingTier: a.messagingTier ?? null,
    qualityRating: a.qualityRating ?? null,
    dailyConversationCap: a.dailyConversationCap,
    webhookSubscribedAt: a.webhookSubscribedAt ?? null,
    connectedAt: a.connectedAt,
    disconnectedAt: a.disconnectedAt ?? null,
  };
}

export async function listWhatsappAccounts(ctx: Ctx): Promise<WhatsappAccountSummary[]> {
  requireTenant(ctx);
  const rows = await repo.queryMany<WhatsappAccount>('whatsappAccounts', {}, ctx, {
    limit: 50,
    sort: { connectedAt: -1 } as never,
  });
  return rows.map(toSummary).sort((a, b) => {
    // Active accounts first, then disconnected by most-recent disconnect.
    if (a.disconnectedAt === null && b.disconnectedAt !== null) return -1;
    if (a.disconnectedAt !== null && b.disconnectedAt === null) return 1;
    return b.connectedAt.getTime() - a.connectedAt.getTime();
  });
}
