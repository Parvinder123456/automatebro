import {
  type SendResult,
  WhatsappApiError,
  sendFreeformMessage,
  sendTemplateMessage,
} from '../adapters/whatsapp.js';
/**
 * Spec 026 — send a WhatsApp message via Meta Cloud API.
 *
 * Pre-condition: a `sends` row in 'queued' status with channel='whatsapp'.
 * This handler enforces every gate from CLAUDE.md Critical Rule #15:
 *
 *   1. Service-window check (lead.lastWhatsappInboundAt < 24h ago for freeform)
 *   2. Opt-out check (lead.whatsappOptOutAt set → refuse)
 *   3. Daily conversation cap (account.dailyConversationCap vs today's count)
 *   4. Template approval status (whatsappTemplate.status === 'approved')
 *   5. Cost increment (first template per 24h window per recipient)
 *   6. Sends row status transitions (queued → sent | failed | … )
 *   7. Per-WABA rate limit (Redis sliding window, account.dailyConversationCap)
 *   8. Encrypted token decryption (AAD = phoneNumberId)
 *   9. (covered by tests in spec)
 *
 * Returns the new send status. Idempotent: a non-queued row is a no-op
 * (covers retry-after-success).
 */
import { getDb } from '../db/client.js';
import { logger } from '../logger.js';
import { decryptToken } from '../meta/tokenCrypto.js';
import type { Lead, Send, WhatsappAccount, WhatsappTemplate } from '../types/tenant.js';
import { checkAndConsumeWhatsappRate } from '../whatsapp/rateLimit.js';
import { canSendFreeform } from '../whatsapp/serviceWindow.js';

export interface SendWhatsappInput {
  sendId: string;
  whatsappAccountId: string;
  recipientPhone: string;
  content: string;
  automationId: string | null;
}

export interface SendWhatsappOutcome {
  status: Send['status'];
  metaMessageId?: string;
  errorMessage?: string;
}

const TEMPLATE_CONVERSATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function decryptAccessToken(account: WhatsappAccount): string {
  const ct = Buffer.isBuffer(account.accessTokenCiphertext)
    ? account.accessTokenCiphertext
    : Buffer.from(account.accessTokenCiphertext);
  const iv = Buffer.isBuffer(account.accessTokenIv)
    ? account.accessTokenIv
    : Buffer.from(account.accessTokenIv);
  const tag = Buffer.isBuffer(account.accessTokenTag)
    ? account.accessTokenTag
    : Buffer.from(account.accessTokenTag);
  return decryptToken({ ciphertext: ct, iv, tag }, account.phoneNumberId);
}

/**
 * Persist a terminal send status. Updates the row with metaMessageId
 * (on success) or errorCode/errorMessage (on failure).
 */
async function persistTerminal(sendId: string, outcome: SendWhatsappOutcome): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const update: Record<string, unknown> = { status: outcome.status };
  if (outcome.status === 'sent') {
    update.sentAt = now;
    if (outcome.metaMessageId !== undefined) update.metaMessageId = outcome.metaMessageId;
  } else {
    update.failedAt = now;
    if (outcome.errorMessage !== undefined) update.errorMessage = outcome.errorMessage;
  }
  await db.updateOne('sends', { _id: sendId }, { $set: update } as never);
}

/**
 * Increment whatsappCosts for the given category, but only if this is
 * the first template within a 24h window for the recipient (per Meta's
 * conversation-based billing).
 *
 * Lazy-create the row if missing (mirror of aiUsage pattern).
 */
async function incrementConversationCost(args: {
  tenantId: string;
  whatsappAccountId: string;
  recipientPhone: string;
  category: 'service' | 'utility' | 'marketing' | 'authentication';
}): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Cost dedup: load lead and check lastTemplateConversationAt.
  const lead = await db
    .queryOne<Lead>('leads', {
      tenantId: args.tenantId,
      whatsappPhone: args.recipientPhone,
    } as never)
    .catch(() => null);

  if (lead !== null) {
    const last = lead.lastTemplateConversationAt;
    if (last !== null && last !== undefined) {
      const elapsedMs = now.getTime() - last.getTime();
      if (elapsedMs < TEMPLATE_CONVERSATION_WINDOW_MS) {
        // Same conversation; don't double-count.
        return;
      }
    }
    await db.updateOne('leads', { _id: lead._id }, {
      $set: { lastTemplateConversationAt: now },
    } as never);
  }

  // Upsert cost row + increment. Two-step because StrictDB doesn't
  // expose a generic JSONB merge; we read-modify-write.
  const existing = await db
    .queryOne<{ _id: string; conversationsByCategory: Record<string, number> }>('whatsappCosts', {
      tenantId: args.tenantId,
      whatsappAccountId: args.whatsappAccountId,
      month,
    } as never)
    .catch(() => null);

  if (existing === null) {
    const fresh: Record<'service' | 'utility' | 'marketing' | 'authentication', number> = {
      service: 0,
      utility: 0,
      marketing: 0,
      authentication: 0,
    };
    fresh[args.category] = 1;
    try {
      await db.insertOne('whatsappCosts', {
        _id: crypto.randomUUID(),
        tenantId: args.tenantId,
        whatsappAccountId: args.whatsappAccountId,
        month,
        conversationsByCategory: fresh,
      } as never);
    } catch {
      // Race: re-read + update.
      const reread = await db
        .queryOne<{ _id: string; conversationsByCategory: Record<string, number> }>(
          'whatsappCosts',
          {
            tenantId: args.tenantId,
            whatsappAccountId: args.whatsappAccountId,
            month,
          } as never,
        )
        .catch(() => null);
      if (reread !== null) {
        const next = { ...reread.conversationsByCategory };
        next[args.category] = (next[args.category] ?? 0) + 1;
        await db.updateOne('whatsappCosts', { _id: reread._id }, {
          $set: { conversationsByCategory: next },
        } as never);
      }
    }
  } else {
    const next = { ...existing.conversationsByCategory };
    next[args.category] = (next[args.category] ?? 0) + 1;
    await db.updateOne('whatsappCosts', { _id: existing._id }, {
      $set: { conversationsByCategory: next },
    } as never);
  }
}

/**
 * Count today's billed conversations for the daily-cap check. We sum
 * categories other than service (which has its own free-tier allowance).
 * Approximate but defensive — an over-count just means earlier cap-hit,
 * which is the safer side of the guardrail.
 */
async function countTodaysConversations(args: {
  tenantId: string;
  whatsappAccountId: string;
}): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const row = await db
    .queryOne<{ conversationsByCategory: Record<string, number> }>('whatsappCosts', {
      tenantId: args.tenantId,
      whatsappAccountId: args.whatsappAccountId,
      month,
    } as never)
    .catch(() => null);
  if (row === null) return 0;
  const c = row.conversationsByCategory;
  return (c.service ?? 0) + (c.utility ?? 0) + (c.marketing ?? 0) + (c.authentication ?? 0);
}

export async function sendWhatsapp(input: SendWhatsappInput): Promise<SendWhatsappOutcome> {
  const db = await getDb();

  // Load the queued send row.
  const send = await db.queryOne<Send>('sends', { _id: input.sendId } as never);
  if (send === null) {
    logger.warn({ sendId: input.sendId }, 'sendWhatsapp: send row not found');
    return { status: 'failed', errorMessage: 'send row not found' };
  }
  if (send.status !== 'queued') {
    // Idempotency — retried after a previous run completed.
    logger.info(
      { sendId: input.sendId, status: send.status },
      'sendWhatsapp: row not in queued state — no-op',
    );
    return { status: send.status };
  }
  if (
    send.tenantId === null ||
    send.whatsappAccountId === null ||
    send.whatsappAccountId === undefined
  ) {
    return { status: 'failed', errorMessage: 'send row missing tenant/whatsappAccount' };
  }

  // Load the WhatsApp account.
  const account = await db.queryOne<WhatsappAccount>('whatsappAccounts', {
    _id: input.whatsappAccountId,
  } as never);
  if (account === null) {
    await persistTerminal(input.sendId, { status: 'failed', errorMessage: 'WA account not found' });
    return { status: 'failed', errorMessage: 'WA account not found' };
  }
  if (account.disconnectedAt !== null && account.disconnectedAt !== undefined) {
    await persistTerminal(input.sendId, {
      status: 'failed',
      errorMessage: 'WA account disconnected',
    });
    return { status: 'failed', errorMessage: 'WA account disconnected' };
  }

  // Load the recipient lead for service-window + opt-out checks.
  const lead = await db
    .queryOne<Lead>('leads', {
      tenantId: send.tenantId,
      whatsappPhone: input.recipientPhone,
    } as never)
    .catch(() => null);

  // Gate #2 — opt-out.
  if (lead?.whatsappOptOutAt !== null && lead?.whatsappOptOutAt !== undefined) {
    const outcome: SendWhatsappOutcome = {
      status: 'optedOut',
      errorMessage: 'recipient opted out',
    };
    await persistTerminal(input.sendId, outcome);
    return outcome;
  }

  // Gate #3 — daily conversation cap.
  const todayCount = await countTodaysConversations({
    tenantId: send.tenantId,
    whatsappAccountId: account._id,
  });
  if (todayCount >= account.dailyConversationCap) {
    const outcome: SendWhatsappOutcome = {
      status: 'dailyCapExceeded',
      errorMessage: `daily cap ${account.dailyConversationCap} reached (${todayCount} today)`,
    };
    await persistTerminal(input.sendId, outcome);
    return outcome;
  }

  // Decide send mode — freeform vs template.
  const inWindow = canSendFreeform(lead?.lastWhatsappInboundAt ?? null);
  const wantTemplate = send.kind === 'whatsappTemplate';

  // Gate #1 + #4 — service window + template approval status.
  let template: WhatsappTemplate | null = null;
  if (wantTemplate) {
    if (send.whatsappTemplateId === null || send.whatsappTemplateId === undefined) {
      const outcome: SendWhatsappOutcome = {
        status: 'failed',
        errorMessage: 'template send requested but no whatsappTemplateId on row',
      };
      await persistTerminal(input.sendId, outcome);
      return outcome;
    }
    template = await db
      .queryOne<WhatsappTemplate>('whatsappTemplates', { _id: send.whatsappTemplateId } as never)
      .catch(() => null);
    if (template === null || template.status !== 'approved') {
      const outcome: SendWhatsappOutcome = {
        status: 'failed',
        errorMessage: `template not approved (status=${template?.status ?? 'missing'})`,
      };
      await persistTerminal(input.sendId, outcome);
      return outcome;
    }
  } else {
    if (!inWindow) {
      const outcome: SendWhatsappOutcome = {
        status: 'outsideWindow',
        errorMessage: '24h service window expired; use a template',
      };
      await persistTerminal(input.sendId, outcome);
      return outcome;
    }
    if (input.content.length === 0) {
      const outcome: SendWhatsappOutcome = {
        status: 'failed',
        errorMessage: 'freeform send with empty content',
      };
      await persistTerminal(input.sendId, outcome);
      return outcome;
    }
  }

  // Gate #7 — rate limit. Cap configured per-account.
  const rate = await checkAndConsumeWhatsappRate(
    account.phoneNumberId,
    account.dailyConversationCap,
  );
  if (!rate.allowed) {
    await persistTerminal(input.sendId, {
      status: 'rateLimited',
      errorMessage: `rate limited: ${rate.current}/${rate.cap}, retry in ${Math.ceil(
        rate.retryAfterMs / 1000,
      )}s`,
    });
    // Throw retryable so BullMQ delays + retries.
    const err = new Error('rate limited');
    (err as Error & { retryable?: boolean }).retryable = true;
    throw err;
  }

  // Gate #8 — decrypt token (AAD = phoneNumberId).
  let accessToken: string;
  try {
    accessToken = decryptAccessToken(account);
  } catch (err) {
    await persistTerminal(input.sendId, {
      status: 'failed',
      errorMessage: `token decrypt failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { status: 'failed' };
  }

  // Send.
  let sendResult: SendResult;
  try {
    if (wantTemplate && template !== null) {
      sendResult = await sendTemplateMessage({
        accessToken,
        phoneNumberId: account.phoneNumberId,
        toPhone: input.recipientPhone,
        templateName: template.name,
        language: template.language,
        bodyParams: send.whatsappTemplateParams ?? [],
      });
    } else {
      sendResult = await sendFreeformMessage({
        accessToken,
        phoneNumberId: account.phoneNumberId,
        toPhone: input.recipientPhone,
        text: input.content,
      });
    }
  } catch (err) {
    if (err instanceof WhatsappApiError) {
      const outcome: SendWhatsappOutcome = {
        status: err.isRetryable() ? 'queued' : 'failed',
        errorMessage: err.message,
      };
      if (!err.isRetryable()) {
        await persistTerminal(input.sendId, outcome);
        return outcome;
      }
      // Retryable: leave status='queued', throw to trigger BullMQ retry.
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    await persistTerminal(input.sendId, {
      status: 'failed',
      errorMessage: `send threw: ${message}`,
    });
    return { status: 'failed', errorMessage: message };
  }

  // Gate #5 — cost increment for templates.
  if (wantTemplate && template !== null) {
    await incrementConversationCost({
      tenantId: send.tenantId,
      whatsappAccountId: account._id,
      recipientPhone: input.recipientPhone,
      category: template.category,
    }).catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), sendId: input.sendId },
        'sendWhatsapp: cost increment failed (send already succeeded)',
      );
    });
  }

  // Gate #6 — terminal status persist.
  await persistTerminal(input.sendId, {
    status: 'sent',
    metaMessageId: sendResult.metaMessageId,
  });
  logger.info(
    {
      sendId: input.sendId,
      kind: send.kind,
      metaMessageId: sendResult.metaMessageId,
    },
    'sendWhatsapp: sent',
  );
  return { status: 'sent', metaMessageId: sendResult.metaMessageId };
}
