/**
 * Spec 026 — create + optionally submit a WhatsApp message template.
 *
 * Two-mode write:
 *   - draft (submitToMeta=false): persist row with status='draft'.
 *     Tenant can edit and submit later.
 *   - submit (submitToMeta=true): persist row, then call Meta's
 *     POST /<wabaId>/message_templates. On success, update status to
 *     'pending' + record metaTemplateId. On failure, leave as 'draft'
 *     so tenant can fix + re-submit.
 *
 * V1 supports text-only body + optional footer (spec 026 §3.7). Buttons
 * + media headers + lists land in spec 027.
 */
import { randomUUID } from 'node:crypto';
import { submitTemplate } from '../../adapters/whatsapp.js';
import type { Ctx } from '../../auth/ctx.js';
import { requireTenant } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import { logger } from '../../logger.js';
import { decryptToken } from '../../meta/tokenCrypto.js';
import type { WhatsappAccount, WhatsappTemplate } from '../../types/tenant.js';

export interface CreateWhatsappTemplateInput {
  whatsappAccountId: string;
  name: string;
  category: 'service' | 'utility' | 'marketing' | 'authentication';
  language: string;
  bodyText: string;
  footerText?: string;
  submitToMeta: boolean;
}

const VARIABLE_REGEX = /\{\{(\d+)\}\}/g;

function countVariables(bodyText: string): number {
  const seen = new Set<number>();
  for (const match of bodyText.matchAll(VARIABLE_REGEX)) {
    const n = Number.parseInt(match[1] ?? '0', 10);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  return seen.size;
}

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

function metaCategoryFor(category: CreateWhatsappTemplateInput['category']): {
  meta: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
} | null {
  // Service is customer-initiated and has no template equivalent for
  // submission — Meta only accepts MARKETING / UTILITY / AUTHENTICATION
  // for template_create. Reject 'service' at the boundary.
  switch (category) {
    case 'marketing':
      return { meta: 'MARKETING' };
    case 'utility':
      return { meta: 'UTILITY' };
    case 'authentication':
      return { meta: 'AUTHENTICATION' };
    default:
      return null;
  }
}

export async function createWhatsappTemplate(
  input: CreateWhatsappTemplateInput,
  ctx: Ctx,
): Promise<WhatsappTemplate> {
  requireTenant(ctx);

  if (input.category === 'service') {
    throw new Error(
      'createWhatsappTemplate: service-category templates are not submittable to Meta; service conversations are customer-initiated only',
    );
  }
  if (!/^[a-z0-9_]+$/.test(input.name)) {
    throw new Error(
      'createWhatsappTemplate: name must be lowercase letters, digits, and underscores only',
    );
  }

  const variableCount = countVariables(input.bodyText);
  const now = new Date();
  const id = randomUUID();

  // 1. Verify the account belongs to this tenant.
  const account = await repo.queryOne<WhatsappAccount>(
    'whatsappAccounts',
    { _id: input.whatsappAccountId },
    ctx,
  );
  if (account === null) {
    throw new Error('createWhatsappTemplate: WhatsApp account not found for current tenant');
  }
  if (account.disconnectedAt !== null && account.disconnectedAt !== undefined) {
    throw new Error('createWhatsappTemplate: WhatsApp account is disconnected');
  }

  // 2. Insert as draft. Submission below may update.
  const draft: WhatsappTemplate = {
    _id: id,
    tenantId: ctx.tenantId as string,
    whatsappAccountId: input.whatsappAccountId,
    name: input.name,
    category: input.category,
    language: input.language,
    bodyText: input.bodyText,
    footerText: input.footerText ?? null,
    variableCount,
    status: 'draft',
    metaTemplateId: null,
    rejectionReason: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    pausedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertOne('whatsappTemplates', draft, ctx);

  if (!input.submitToMeta) {
    return draft;
  }

  // 3. Submit to Meta. On failure, the row stays as 'draft' and we
  //    surface the error so the form can show it.
  const metaCategory = metaCategoryFor(input.category);
  if (metaCategory === null) {
    throw new Error('createWhatsappTemplate: unsupported category for submission');
  }

  let metaTemplateId: string;
  try {
    const accessToken = decryptAccessToken(account);
    const submitArgs: Parameters<typeof submitTemplate>[0] = {
      accessToken,
      wabaId: account.wabaId,
      name: input.name,
      category: metaCategory.meta,
      language: input.language,
      bodyText: input.bodyText,
    };
    if (input.footerText !== undefined && input.footerText.length > 0) {
      submitArgs.footerText = input.footerText;
    }
    const result = await submitTemplate(submitArgs);
    metaTemplateId = result.metaTemplateId;
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        templateId: id,
        name: input.name,
      },
      'createWhatsappTemplate: Meta submit failed (row stays as draft)',
    );
    // Surface the Meta error to the caller so the form can render it.
    throw err;
  }

  // 4. Record submission outcome.
  await repo.updateOne(
    'whatsappTemplates',
    { _id: id },
    {
      $set: {
        status: 'pending',
        metaTemplateId,
        submittedAt: now,
        updatedAt: now,
      },
    },
    ctx,
  );

  return {
    ...draft,
    status: 'pending',
    metaTemplateId,
    submittedAt: now,
    updatedAt: now,
  };
}
