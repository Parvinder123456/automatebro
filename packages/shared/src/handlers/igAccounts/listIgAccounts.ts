/**
 * Spec 004 — list a tenant's connected Instagram accounts.
 * Token ciphertext + IV + tag are NEVER returned to the client.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { IgAccount } from '../../types/tenant.js';

export interface IgAccountSummary {
  _id: string;
  igUserId: string;
  igUsername: string;
  pageName: string | null;
  webhookSubscribedAt: Date | null;
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  disconnectedAt: Date | null;
}

export async function listIgAccounts(ctx: Ctx): Promise<IgAccountSummary[]> {
  const rows = await repo.queryMany<IgAccount>('igAccounts', {}, ctx, { limit: 100 });
  return rows.map((row) => ({
    _id: row._id,
    igUserId: row.igUserId,
    igUsername: row.igUsername,
    pageName: row.pageName ?? null,
    webhookSubscribedAt: row.webhookSubscribedAt ?? null,
    tokenExpiresAt: row.tokenExpiresAt ?? null,
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt ?? null,
  }));
}
