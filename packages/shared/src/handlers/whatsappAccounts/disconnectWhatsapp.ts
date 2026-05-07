/**
 * Spec 026 — disconnect a WhatsApp account.
 *
 * Soft-disconnect: set `disconnectedAt` on the row but do NOT delete.
 * Existing leads with `whatsappAccountId` pointing at this row remain
 * intact — historical data preserved. The account can be reconnected
 * later via `connectWhatsapp` (which clears `disconnectedAt`).
 *
 * Mirror of `disconnectIgAccount`. Does not call Meta's
 * /{phone-number-id}/deregister — that's destructive (the phone leaves
 * the WABA entirely). v1 disconnect is local-only; the Meta-side
 * relationship persists until the tenant removes it themselves.
 */
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import { logger } from '../../logger.js';
import type { WhatsappAccount } from '../../types/tenant.js';

export interface DisconnectWhatsappInput {
  whatsappAccountId: string;
}

export interface DisconnectWhatsappResult {
  ok: true;
  alreadyDisconnected: boolean;
}

export async function disconnectWhatsapp(
  input: DisconnectWhatsappInput,
  ctx: Ctx,
): Promise<DisconnectWhatsappResult> {
  requireTenant(ctx);

  const existing = await repo.queryOne<WhatsappAccount>(
    'whatsappAccounts',
    { _id: input.whatsappAccountId },
    ctx,
  );
  if (existing === null) {
    throw new Error(`disconnectWhatsapp: no account ${input.whatsappAccountId} for current tenant`);
  }
  if (existing.disconnectedAt !== null && existing.disconnectedAt !== undefined) {
    return { ok: true, alreadyDisconnected: true };
  }

  await repo.updateOne(
    'whatsappAccounts',
    { _id: input.whatsappAccountId },
    { $set: { disconnectedAt: new Date() } },
    ctx,
  );
  logger.info(
    { whatsappAccountId: input.whatsappAccountId },
    'disconnectWhatsapp: marked disconnected',
  );
  return { ok: true, alreadyDisconnected: false };
}
