/**
 * Spec 003 — StrictDB collection registration.
 *
 * Called once at app startup from getDb() (db/client.ts) after StrictDB
 * is created. Registers Zod schemas + index hints. db.ensureIndexes()
 * runs after registration to create the indexes in Postgres.
 *
 * Adding a new collection later? Add the Zod schema here, register it
 * inside registerSchemas(), and ship a SQL migration that creates the
 * underlying table.
 */
import type { StrictDB } from 'strictdb';
import { z } from 'zod';

export const TenantSchema = z.object({
  _id: z.string().uuid(),
  name: z.string().min(1).max(120),
  // 3-64 chars, lowercase alphanumerics + hyphens. Generated via slugify().
  slug: z.string().regex(/^[a-z0-9-]{3,64}$/),
  plan: z.enum(['free', 'starter', 'growth', 'agency']),
  dpdpConsentAt: z.date().nullable().optional(),
  createdAt: z.date(),
  deletedAt: z.date().nullable().optional(),
  // Spec 013 — when the workspace owner clicked "Delete workspace".
  // Same timestamp as `deletedAt` at the moment of the request; preserved
  // separately so an operator un-delete (clearing `deletedAt`) doesn't
  // erase the original request time. Hard-delete cron (spec 014) reads
  // this to compute the 30-day grace period.
  deletionRequestedAt: z.date().nullable().optional(),
});

export const UserSchema = z.object({
  _id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  createdAt: z.date(),
});

export const TenantUserSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member']),
  invitedAt: z.date().nullable().optional(),
  acceptedAt: z.date(),
});

// Spec 016 — AI intent classifier vocabulary. Four labels chosen for
// clarity + actionability. Adding a label is a Zod-only change (no DB
// migration) because the underlying SQL column is plain TEXT.
export const IntentSchema = z.enum(['buying', 'support', 'spam', 'other']);
export type Intent = z.infer<typeof IntentSchema>;

export const EventSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  metaEventId: z.string().min(1),
  // Spec 026 — added 'whatsappMessage', 'whatsappStatus' (delivery /
  // read / failed receipts), 'whatsappTemplateStatus' (Meta approval
  // pings). Existing IG kinds unchanged.
  kind: z.enum([
    'comment',
    'message',
    'storyReply',
    'messageReaction',
    'mention',
    'whatsappMessage',
    'whatsappStatus',
    'whatsappTemplateStatus',
  ]),
  igAccountId: z.string().uuid().nullable(),
  // Spec 026 — populated when kind starts with 'whatsapp'. Null for IG
  // events. Mirror of igAccountId for the WhatsApp domain.
  whatsappAccountId: z.string().uuid().nullable().optional(),
  payload: z.unknown(),
  signatureVerified: z.boolean(),
  receivedAt: z.date(),
  processedAt: z.date().nullable().optional(),
  // Spec 016 — populated by classifyIntent on the worker. NULL until
  // classified (or when the AI cap is exceeded for this tenant/month).
  intent: IntentSchema.nullable().optional(),
  intentConfidence: z.number().min(0).max(1).nullable().optional(),
});

export const LeadSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  // Spec 026 — igAccountId is now nullable so leads can exist as
  // WA-only (no IG account ever attached). Existing IG-only leads are
  // unaffected; new cross-channel leads can have both set.
  igAccountId: z.string().uuid().nullable().optional(),
  igUserId: z.string().min(1).nullable().optional(),
  igUsername: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  // Spec 026 — WhatsApp identity. `whatsappPhone` is E.164 (e.g. +91…);
  // can equal `phone` if captured both ways but tracked separately so
  // `phone` can stay free-form (regex-parsed from message body).
  whatsappPhone: z.string().nullable().optional(),
  whatsappAccountId: z.string().uuid().nullable().optional(),
  whatsappOptInAt: z.date().nullable().optional(),
  whatsappOptOutAt: z.date().nullable().optional(),
  // Service-window math — set on every inbound WA message. Read by
  // sendWhatsapp before each send to enforce the 24h rule.
  lastWhatsappInboundAt: z.date().nullable().optional(),
  // Cost dedup — first template within a 24h window opens a paid
  // conversation; subsequent templates in the same window are free.
  lastTemplateConversationAt: z.date().nullable().optional(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  tags: z.array(z.string()),
  attributedAutomationId: z.string().uuid().nullable().optional(),
});

export const AiUsageSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costInr: z.number().int().nonnegative(),
  cap: z.number().int().positive(),
});

export const AutomationSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  // Spec 026 — igAccountId is now nullable so an automation can be
  // WhatsApp-only (whatsappAccountId set instead). Either-or, never
  // both: a single automation belongs to exactly one channel.
  igAccountId: z.string().uuid().nullable().optional(),
  whatsappAccountId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  // Spec 015 — `dm` added so an automation can fire on inbound DMs.
  // Spec 017 (story-reply) + post-launch (mention) extend further; both
  // are gated on Meta App Review for `instagram_manage_messages`.
  // Spec 026 — `whatsappMessage` added for inbound WhatsApp messages.
  trigger: z.enum(['comment', 'dm', 'storyReply', 'mention', 'whatsappMessage']),
  status: z.enum(['active', 'paused', 'archived']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const TriggerSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  automationId: z.string().uuid(),
  keywords: z.array(z.string().min(1)).min(1),
  matchMode: z.enum(['contains', 'exact', 'startsWith']),
  postIds: z.array(z.string()).nullable().optional(),
  // Spec 016 — when non-null and non-empty, the trigger only fires if
  // the event's classified intent is in this list. NULL or [] = "any
  // intent" (default; backwards-compatible with pre-spec-016 triggers).
  intents: z.array(IntentSchema).nullable().optional(),
});

export const ResponseSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  automationId: z.string().uuid(),
  mode: z.enum(['static', 'ai']),
  template: z.string().nullable().optional(),
  aiPrompt: z.string().nullable().optional(),
  aiTone: z.enum(['friendly', 'professional', 'playful']).nullable().optional(),
  fallbackTemplate: z.string().nullable().optional(),
  commentReply: z.string().nullable().optional(),
  // Spec 026 — when the parent automation has trigger='whatsappMessage'
  // and `mode='static'`, this points at an approved WhatsApp template
  // for out-of-window sends. Null = freeform-only (in-window only).
  whatsappTemplateId: z.string().uuid().nullable().optional(),
});

export const SendSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  // Spec 026 — `channel` discriminates IG sends from WA sends. Older
  // rows pre-dating spec 026 are backfilled to 'instagram' by migration
  // 017. New code always sets it explicitly.
  channel: z.enum(['instagram', 'whatsapp']),
  // Spec 026 — igAccountId nullable; for channel='whatsapp' use
  // whatsappAccountId instead. CHECK constraint at DB level enforces
  // exactly-one-set.
  igAccountId: z.string().uuid().nullable().optional(),
  whatsappAccountId: z.string().uuid().nullable().optional(),
  automationId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  // Spec 026 — recipientPsid nullable; recipientPhone (E.164) used for
  // WhatsApp sends. CHECK constraint enforces exactly-one-set.
  recipientPsid: z.string().min(1).nullable().optional(),
  recipientPhone: z.string().min(1).nullable().optional(),
  // Spec 026 — extended kinds. Existing IG kinds unchanged.
  kind: z.enum(['dm', 'commentReply', 'whatsappFreeform', 'whatsappTemplate']),
  // Spec 026 — when kind='whatsappTemplate', identifies which template
  // was used + the parameter values substituted into it.
  whatsappTemplateId: z.string().uuid().nullable().optional(),
  whatsappTemplateName: z.string().nullable().optional(),
  whatsappTemplateLanguage: z.string().nullable().optional(),
  whatsappTemplateParams: z.array(z.string()).nullable().optional(),
  content: z.string(),
  aiGenerated: z.boolean(),
  // Spec 026 — added 'optedOut' (customer sent STOP) and
  // 'dailyCapExceeded' (per-tenant guardrail). Existing statuses
  // unchanged.
  status: z.enum([
    'queued',
    'sent',
    'failed',
    'rateLimited',
    'outsideWindow',
    'optedOut',
    'dailyCapExceeded',
  ]),
  metaMessageId: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  attempt: z.number().int().positive(),
  queuedAt: z.date(),
  sentAt: z.date().nullable().optional(),
  failedAt: z.date().nullable().optional(),
});

export const IgAccountSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  igUserId: z.string().min(1),
  igUsername: z.string().min(1),
  pageId: z.string().min(1),
  pageName: z.string().nullable().optional(),
  accessTokenCiphertext: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  accessTokenIv: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  accessTokenTag: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  tokenKeyVersion: z.number().int().positive(),
  tokenExpiresAt: z.date().nullable().optional(),
  scopes: z.array(z.string()),
  webhookSubscribedAt: z.date().nullable().optional(),
  connectedAt: z.date(),
  disconnectedAt: z.date().nullable().optional(),
});

// ============================================================
// Spec 026 — WhatsApp foundation
// ============================================================

/**
 * WhatsApp template / conversation categories per Meta's billing model.
 * - service: customer-initiated 24h conversation (1000/month free in IN)
 * - utility: business-initiated, transactional (order updates, etc.)
 * - marketing: business-initiated, promotional (highest cost)
 * - authentication: OTP / verification (lowest cost)
 */
export const WhatsappCategorySchema = z.enum(['service', 'utility', 'marketing', 'authentication']);
export type WhatsappCategory = z.infer<typeof WhatsappCategorySchema>;

/**
 * WhatsApp template lifecycle. Mirrors Meta's `message_template_status`
 * but lower-cased for SQL compatibility.
 *  - draft: tenant created locally, not submitted to Meta yet
 *  - pending: submitted, awaiting Meta review
 *  - approved: usable in sends
 *  - rejected: Meta declined; rejectionReason populated
 *  - paused: Meta auto-paused due to quality issues
 *  - disabled: tenant or admin disabled (won't send even if approved)
 */
export const WhatsappTemplateStatusSchema = z.enum([
  'draft',
  'pending',
  'approved',
  'rejected',
  'paused',
  'disabled',
]);
export type WhatsappTemplateStatus = z.infer<typeof WhatsappTemplateStatusSchema>;

/**
 * Per-tenant WhatsApp Business Account connection. Mirrors `IgAccount`
 * shape: encrypted access token (AES-256-GCM, AAD = phoneNumberId per
 * spec 003 row-swap defence), connection lifecycle timestamps, scopes.
 *
 * One row per (tenant, phone number). A tenant can connect multiple
 * numbers (rare; usually one).
 */
export const WhatsappAccountSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  // Meta-issued IDs.
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  // E.164 display number, e.g. +911234567890.
  displayPhoneNumber: z.string().min(1),
  // Verified business name shown to recipients.
  verifiedName: z.string().nullable().optional(),
  // Encrypted system-user access token (long-lived).
  accessTokenCiphertext: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  accessTokenIv: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  accessTokenTag: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  tokenKeyVersion: z.number().int().positive(),
  // Meta's tier (1/2/3/4); refreshed nightly. Surfaced read-only in UI.
  messagingTier: z.enum(['tier1', 'tier2', 'tier3', 'tier4']).nullable().optional(),
  qualityRating: z.enum(['green', 'yellow', 'red', 'unknown']).nullable().optional(),
  // Per-tenant guardrail. Default 100/day for new accounts; raised on
  // plan upgrade or admin override (spec 026 §7.2).
  dailyConversationCap: z.number().int().positive(),
  scopes: z.array(z.string()),
  webhookSubscribedAt: z.date().nullable().optional(),
  connectedAt: z.date(),
  disconnectedAt: z.date().nullable().optional(),
});
export type WhatsappAccount = z.infer<typeof WhatsappAccountSchema>;

/**
 * Tenant-authored message template. Submitted to Meta for approval via
 * `whatsapp.submitTemplate()`. v1 supports text-only body + optional
 * footer; media headers + buttons + lists land in spec 027.
 */
export const WhatsappTemplateSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
  // Meta name regex: lowercase a-z, 0-9, underscores. 1-512 chars.
  name: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/),
  category: WhatsappCategorySchema,
  // BCP-47-ish: 'en', 'en_US', 'hi', 'hi_IN'. Stored as Meta sends it.
  language: z.string().min(2).max(10),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable().optional(),
  // Number of {{N}} placeholders in bodyText. Derived at write time
  // (parser counts the regex matches) and persisted for query speed.
  variableCount: z.number().int().nonnegative(),
  status: WhatsappTemplateStatusSchema,
  // Populated after Meta returns from POST /<wabaId>/message_templates.
  metaTemplateId: z.string().nullable().optional(),
  // When status='rejected' or 'paused', the operator-actionable message
  // from Meta (e.g. "Generic content"). Surfaced in UI.
  rejectionReason: z.string().nullable().optional(),
  submittedAt: z.date().nullable().optional(),
  approvedAt: z.date().nullable().optional(),
  rejectedAt: z.date().nullable().optional(),
  pausedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WhatsappTemplate = z.infer<typeof WhatsappTemplateSchema>;

/**
 * Per-tenant per-month conversation aggregator. Mirror of `aiUsage` —
 * lazy-create on first send, return synthetic zero-row on read if
 * absent (per spec 019 lessons).
 *
 * `conversationsByCategory` is an object map serialised as JSONB so we
 * can add new categories without migrations. Keys are
 * WhatsappCategory; values are non-negative integers.
 */
export const WhatsappCostsSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
  // YYYY-MM, same shape as aiUsage.month.
  month: z.string().regex(/^\d{4}-\d{2}$/),
  conversationsByCategory: z.object({
    service: z.number().int().nonnegative(),
    utility: z.number().int().nonnegative(),
    marketing: z.number().int().nonnegative(),
    authentication: z.number().int().nonnegative(),
  }),
});
export type WhatsappCosts = z.infer<typeof WhatsappCostsSchema>;

/**
 * Immutable opt-in / opt-out audit log. DPDP + Meta require provable
 * trail of when a contact opted in or out. Append-only — no updates,
 * no deletes (enforced by handler, not DB).
 */
export const WhatsappOptInLogSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  whatsappAccountId: z.string().uuid(),
  phone: z.string().min(1),
  action: z.enum(['optIn', 'optOut']),
  // 'whatsapp_inbound' (customer messaged us first), 'stop_keyword'
  // (customer typed STOP), 'web_form' (lead form on tenant's site —
  // future), 'admin_override' (operator set manually for compliance).
  source: z.enum(['whatsapp_inbound', 'stop_keyword', 'web_form', 'admin_override']),
  // Whatever evidence we can capture: an inbound message wamid, a form
  // submission ID, or operator note.
  evidence: z.string().nullable().optional(),
  recordedAt: z.date(),
});
export type WhatsappOptInLog = z.infer<typeof WhatsappOptInLogSchema>;

/**
 * Register all v1 collections with StrictDB. Called by getDb() exactly
 * once per process. Subsequent specs add more collections to this list.
 */
export function registerSchemas(db: StrictDB): void {
  db.registerCollection({
    name: 'tenants',
    schema: TenantSchema,
    indexes: [{ collection: 'tenants', fields: { slug: 1 }, unique: true }],
  });
  db.registerCollection({
    name: 'users',
    schema: UserSchema,
    indexes: [{ collection: 'users', fields: { email: 1 }, unique: true }],
  });
  db.registerCollection({
    name: 'tenantUsers',
    schema: TenantUserSchema,
    indexes: [
      { collection: 'tenantUsers', fields: { tenantId: 1, userId: 1 }, unique: true },
      { collection: 'tenantUsers', fields: { userId: 1 } },
    ],
  });
  db.registerCollection({
    name: 'igAccounts',
    schema: IgAccountSchema,
    indexes: [
      { collection: 'igAccounts', fields: { tenantId: 1, igUserId: 1 }, unique: true },
      { collection: 'igAccounts', fields: { tenantId: 1 } },
      { collection: 'igAccounts', fields: { igUserId: 1 } },
    ],
  });
  db.registerCollection({
    name: 'events',
    schema: EventSchema,
    indexes: [
      { collection: 'events', fields: { metaEventId: 1 }, unique: true },
      { collection: 'events', fields: { tenantId: 1, kind: 1, receivedAt: -1 } },
    ],
  });
  db.registerCollection({
    name: 'automations',
    schema: AutomationSchema,
    indexes: [{ collection: 'automations', fields: { tenantId: 1, status: 1 } }],
  });
  db.registerCollection({
    name: 'triggers',
    schema: TriggerSchema,
    indexes: [{ collection: 'triggers', fields: { automationId: 1 } }],
  });
  db.registerCollection({
    name: 'responses',
    schema: ResponseSchema,
    indexes: [{ collection: 'responses', fields: { automationId: 1 } }],
  });
  db.registerCollection({
    name: 'sends',
    schema: SendSchema,
    indexes: [
      { collection: 'sends', fields: { tenantId: 1, status: 1 } },
      { collection: 'sends', fields: { igAccountId: 1, sentAt: -1 } },
    ],
  });
  db.registerCollection({
    name: 'aiUsage',
    schema: AiUsageSchema,
    indexes: [{ collection: 'aiUsage', fields: { tenantId: 1, month: 1 }, unique: true }],
  });
  db.registerCollection({
    name: 'leads',
    schema: LeadSchema,
    indexes: [
      // Spec 026 — the original (tenantId, igAccountId, igUserId)
      // unique index is now a partial unique index (only when
      // igUserId IS NOT NULL) declared in migration 018. Strict DB
      // doesn't support partial-unique declarations directly, so the
      // hint here is a non-unique compound index; uniqueness is
      // enforced by the SQL CHECK + partial unique index in 018.
      { collection: 'leads', fields: { tenantId: 1, igAccountId: 1, igUserId: 1 } },
      { collection: 'leads', fields: { tenantId: 1, lastSeenAt: -1 } },
      // Spec 026 — WA identity lookup. Partial unique on
      // (tenantId, whatsappPhone) WHERE whatsappPhone IS NOT NULL is
      // also declared in migration 018.
      { collection: 'leads', fields: { tenantId: 1, whatsappPhone: 1 } },
    ],
  });

  // Spec 026 — WhatsApp foundation collections.
  db.registerCollection({
    name: 'whatsappAccounts',
    schema: WhatsappAccountSchema,
    indexes: [
      { collection: 'whatsappAccounts', fields: { phoneNumberId: 1 }, unique: true },
      { collection: 'whatsappAccounts', fields: { tenantId: 1 } },
      { collection: 'whatsappAccounts', fields: { wabaId: 1 } },
    ],
  });
  db.registerCollection({
    name: 'whatsappTemplates',
    schema: WhatsappTemplateSchema,
    indexes: [
      {
        collection: 'whatsappTemplates',
        fields: { tenantId: 1, name: 1, language: 1 },
        unique: true,
      },
      { collection: 'whatsappTemplates', fields: { tenantId: 1, status: 1 } },
      { collection: 'whatsappTemplates', fields: { metaTemplateId: 1 } },
    ],
  });
  db.registerCollection({
    name: 'whatsappCosts',
    schema: WhatsappCostsSchema,
    indexes: [
      {
        collection: 'whatsappCosts',
        fields: { tenantId: 1, whatsappAccountId: 1, month: 1 },
        unique: true,
      },
    ],
  });
  db.registerCollection({
    name: 'whatsappOptInLog',
    schema: WhatsappOptInLogSchema,
    indexes: [
      { collection: 'whatsappOptInLog', fields: { tenantId: 1, phone: 1, recordedAt: -1 } },
    ],
  });
}

/**
 * Generate a URL-safe slug from a workspace name. Appends 6 hex chars
 * for uniqueness. Result matches TenantSchema.slug regex.
 *
 * Examples:
 *   slugify("Parvinder's Studio")  -> "parvinder-s-studio-a3f9c2"
 *   slugify("    !!!  ")           -> "workspace-a3f9c2"
 *   slugify("नमस्ते")              -> "workspace-a3f9c2"
 */
export function slugify(name: string, randomHex: string): string {
  if (randomHex.length !== 6 || !/^[a-f0-9]{6}$/.test(randomHex)) {
    throw new Error('slugify: randomHex must be 6 hex chars');
  }
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  // Ensure base is at least 3 chars after the random suffix is appended
  // (regex floor is 3+1+6 = 10, minimum base is "wks").
  const safe = base.length === 0 ? 'workspace' : base;
  return `${safe}-${randomHex}`;
}
