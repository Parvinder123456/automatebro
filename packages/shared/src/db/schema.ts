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
