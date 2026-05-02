import type { Ctx } from '../auth/ctx.js';
import { requireTenant } from '../auth/ctx.js';
/**
 * Spec 003 — tenant-scoped query helpers.
 *
 * Every multi-tenant collection access goes through `repo.*`. The
 * helpers prepend `{ tenantId: ctx.tenantId }` to the filter / doc,
 * **overriding** any value the caller supplied. This is the third of
 * three multi-tenancy defence layers (engineering plan §7):
 *
 *   1. StrictDB schema requires tenantId (Zod boundary)
 *   2. Handlers receive ctx from session, never request body
 *   3. repo.* prepends tenantId to filters/docs from ctx
 *
 * Direct `db.*` calls from handlers bypass layer 3. Code review
 * enforces "use repo, not db" for any collection that has tenantId.
 *
 * The two exempt collections (`tenants`, `users`) do not have
 * tenantId — they're queried directly via `getDb()` only inside
 * `getCtx` and `createTenant`.
 */
import { getDb } from './client.js';

interface QueryOpts {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

type Filter = Record<string, unknown>;
type Doc = Record<string, unknown>;
type Update = Record<string, unknown>;

function withTenant(filter: Filter, ctx: Ctx & { tenantId: string }): Filter {
  // Override unconditionally — even if caller passed `tenantId`, ctx
  // wins. This prevents privilege escalation via crafted filters.
  return { ...filter, tenantId: ctx.tenantId };
}

/**
 * StrictDB's TypeScript types are tied to schemas registered by name;
 * the dynamic dispatch we do in repo (collection name as a string,
 * any tenant-aware schema) doesn't fit those generics. We cast at the
 * StrictDB boundary — runtime Zod validation still applies.
 */
type LooseFilter = Record<string, unknown>;

export const repo = {
  async queryOne<T>(collection: string, filter: Filter, ctx: Ctx): Promise<T | null> {
    requireTenant(ctx);
    const db = await getDb();
    return db.queryOne<T>(collection, withTenant(filter, ctx) as LooseFilter as never);
  },

  async queryMany<T>(collection: string, filter: Filter, ctx: Ctx, opts?: QueryOpts): Promise<T[]> {
    requireTenant(ctx);
    const db = await getDb();
    return db.queryMany<T>(collection, withTenant(filter, ctx) as LooseFilter as never, opts);
  },

  async count(collection: string, filter: Filter, ctx: Ctx): Promise<number> {
    requireTenant(ctx);
    const db = await getDb();
    return db.count(collection, withTenant(filter, ctx) as LooseFilter as never);
  },

  async insertOne(collection: string, doc: Doc, ctx: Ctx): Promise<unknown> {
    requireTenant(ctx);
    const db = await getDb();
    return db.insertOne(collection, { ...doc, tenantId: ctx.tenantId } as never);
  },

  async updateOne(
    collection: string,
    filter: Filter,
    update: Update,
    ctx: Ctx,
    upsert = false,
  ): Promise<unknown> {
    requireTenant(ctx);
    const db = await getDb();
    return db.updateOne(
      collection,
      withTenant(filter, ctx) as LooseFilter as never,
      update as never,
      upsert,
    );
  },

  async deleteOne(collection: string, filter: Filter, ctx: Ctx): Promise<unknown> {
    requireTenant(ctx);
    const db = await getDb();
    return db.deleteOne(collection, withTenant(filter, ctx) as LooseFilter as never);
  },
};
