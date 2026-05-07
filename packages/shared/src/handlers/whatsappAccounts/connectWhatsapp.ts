/**
 * Spec 026 — connect a WhatsApp Business Account.
 *
 * v1 flow: manual token paste. Tenant pastes (wabaId, phoneNumberId,
 * accessToken) into a form. We:
 *  1. Verify the token by calling `getPhoneNumberInfo` (this is the
 *     proof-of-ownership — only a token with rights to this phone can
 *     read it).
 *  2. Encrypt the token with AAD = phoneNumberId (row-swap defence).
 *  3. Upsert into whatsappAccounts via repo (auto-scopes by tenantId).
 *
 * Returns the newly-connected account summary. Webhook subscription is
 * configured manually in the Meta dashboard for v1; future Embedded
 * Signup flow will configure it automatically (spec 026 §9 Q1).
 */
import { randomUUID } from 'node:crypto';
import { getPhoneNumberInfo } from '../../adapters/whatsapp.js';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import { logger } from '../../logger.js';
import { encryptToken } from '../../meta/tokenCrypto.js';
import type { WhatsappAccount } from '../../types/tenant.js';

export interface ConnectWhatsappInput {
  wabaId: string;
  phoneNumberId: string;
  /** Long-lived system-user access token. Stored encrypted. */
  accessToken: string;
}

export interface ConnectedWhatsappAccount {
  _id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  messagingTier: WhatsappAccount['messagingTier'];
  qualityRating: WhatsappAccount['qualityRating'];
}

const DEFAULT_DAILY_CONVERSATION_CAP = 100;
const DEFAULT_TOKEN_KEY_VERSION = 1;

function normaliseTier(meta: string): WhatsappAccount['messagingTier'] {
  switch (meta) {
    case 'TIER_50':
      return 'tier1';
    case 'TIER_250':
      return 'tier1';
    case 'TIER_1K':
      return 'tier1';
    case 'TIER_10K':
      return 'tier2';
    case 'TIER_100K':
      return 'tier3';
    case 'TIER_UNLIMITED':
      return 'tier4';
    default:
      return 'tier1';
  }
}

function normaliseQuality(meta: string): WhatsappAccount['qualityRating'] {
  switch (meta) {
    case 'GREEN':
      return 'green';
    case 'YELLOW':
      return 'yellow';
    case 'RED':
      return 'red';
    default:
      return 'unknown';
  }
}

export async function connectWhatsapp(
  input: ConnectWhatsappInput,
  ctx: Ctx,
): Promise<ConnectedWhatsappAccount> {
  requireTenant(ctx);

  // Step 1 — verify ownership by calling Meta with the supplied token.
  // If the token is invalid or doesn't have rights to this phone, the
  // call throws WhatsappApiError before we touch the DB.
  const info = await getPhoneNumberInfo({
    accessToken: input.accessToken,
    phoneNumberId: input.phoneNumberId,
  });

  // Sanity: confirm the phoneNumberId Meta returned matches what the
  // tenant pasted. Defends against a token that's valid for some OTHER
  // number (Meta would 200 with the correct id but the user's intent
  // was different).
  if (info.phoneNumberId !== input.phoneNumberId) {
    throw new Error(
      `connectWhatsapp: Meta returned phoneNumberId ${info.phoneNumberId} but tenant pasted ${input.phoneNumberId}`,
    );
  }

  // Step 2 — encrypt token, AAD bound to the phone number id.
  const encrypted = encryptToken(input.accessToken, input.phoneNumberId);
  const now = new Date();

  // Step 3 — upsert. If the tenant is reconnecting an existing account
  // (e.g. token rotated), we update encryption material + tier + reset
  // disconnectedAt to null.
  const existing = await repo
    .queryOne<{ _id: string }>('whatsappAccounts', { phoneNumberId: input.phoneNumberId }, ctx)
    .catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'connectWhatsapp: existing-account lookup failed (continuing as insert)',
      );
      return null;
    });

  const id = existing?._id ?? randomUUID();
  const row: WhatsappAccount = {
    _id: id,
    tenantId: ctx.tenantId,
    wabaId: input.wabaId,
    phoneNumberId: info.phoneNumberId,
    displayPhoneNumber: info.displayPhoneNumber,
    verifiedName: info.verifiedName,
    accessTokenCiphertext: encrypted.ciphertext,
    accessTokenIv: encrypted.iv,
    accessTokenTag: encrypted.tag,
    tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
    messagingTier: normaliseTier(info.messagingTier),
    qualityRating: normaliseQuality(info.qualityRating),
    dailyConversationCap: DEFAULT_DAILY_CONVERSATION_CAP,
    scopes: [], // System-user tokens don't expose scope list via API.
    webhookSubscribedAt: null,
    connectedAt: now,
    disconnectedAt: null,
  };

  if (existing === null) {
    await repo.insertOne('whatsappAccounts', row, ctx);
    logger.info(
      { phoneNumberId: info.phoneNumberId, wabaId: input.wabaId },
      'connectWhatsapp: new account connected',
    );
  } else {
    await repo.updateOne(
      'whatsappAccounts',
      { _id: id },
      {
        $set: {
          wabaId: input.wabaId,
          displayPhoneNumber: info.displayPhoneNumber,
          verifiedName: info.verifiedName,
          accessTokenCiphertext: encrypted.ciphertext,
          accessTokenIv: encrypted.iv,
          accessTokenTag: encrypted.tag,
          tokenKeyVersion: DEFAULT_TOKEN_KEY_VERSION,
          messagingTier: normaliseTier(info.messagingTier),
          qualityRating: normaliseQuality(info.qualityRating),
          connectedAt: now,
          disconnectedAt: null,
        },
      },
      ctx,
    );
    logger.info(
      { phoneNumberId: info.phoneNumberId, wabaId: input.wabaId },
      'connectWhatsapp: account reconnected',
    );
  }

  return {
    _id: id,
    wabaId: input.wabaId,
    phoneNumberId: info.phoneNumberId,
    displayPhoneNumber: info.displayPhoneNumber,
    verifiedName: info.verifiedName,
    messagingTier: row.messagingTier,
    qualityRating: row.qualityRating,
  };
}
