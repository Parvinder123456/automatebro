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

export const EventSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  metaEventId: z.string().min(1),
  kind: z.enum(['comment', 'message', 'storyReply', 'messageReaction', 'mention']),
  igAccountId: z.string().uuid().nullable(),
  payload: z.unknown(),
  signatureVerified: z.boolean(),
  receivedAt: z.date(),
  processedAt: z.date().nullable().optional(),
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
  igAccountId: z.string().uuid(),
  name: z.string().min(1).max(120),
  trigger: z.enum(['comment', 'storyReply', 'mention']),
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
});

export const SendSchema = z.object({
  _id: z.string().uuid(),
  tenantId: z.string().uuid(),
  igAccountId: z.string().uuid(),
  automationId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  recipientPsid: z.string().min(1),
  kind: z.enum(['dm', 'commentReply']),
  content: z.string(),
  aiGenerated: z.boolean(),
  status: z.enum(['queued', 'sent', 'failed', 'rateLimited', 'outsideWindow']),
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
