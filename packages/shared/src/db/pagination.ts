/**
 * Spec 020 / Phase 2.3 — pagination helper for list endpoints.
 *
 * One-shape contract for paginated list handlers. Returns:
 *  - items: the rows for this page
 *  - total: total matching rows (for "Page X of Y" UI)
 *  - page: 1-indexed page number actually returned
 *  - pageSize: actual page size used (after clamping)
 *  - hasNext: convenience boolean
 *
 * Pages are 1-indexed in the public API (URL `?page=1` … `?page=N`).
 * Internally we convert to 0-indexed `skip = (page - 1) * pageSize`.
 *
 * Sorting: each handler whitelists its allowed sort fields (security:
 * never accept arbitrary sort fields from the URL). The helper just
 * passes a typed sort spec through to repo.queryMany.
 */
import type { Ctx } from '../auth/ctx.js';
import { repo } from './repo.js';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface PaginateInput {
  /** 1-indexed. Defaults to 1. */
  page?: number;
  /** Default 25. Max 5000 (covers CSV-export "give me everything" use cases). */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 5000;

/**
 * Clamp page + pageSize into a safe range. Use this in handlers to
 * normalise URL inputs before the DB call.
 */
export function normalisePagination(input: PaginateInput = {}): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/**
 * Run repo.queryMany + repo.count in parallel (Critical Rule #8) and
 * return a Paginated<T>. Caller passes the collection name, filter,
 * ctx, and a typed sort spec.
 */
export async function paginate<T>(
  collection: string,
  filter: Record<string, unknown>,
  ctx: Ctx,
  opts: PaginateInput & {
    sort?: Record<string, 1 | -1>;
  } = {},
): Promise<Paginated<T>> {
  const { page, pageSize, skip } = normalisePagination(opts);

  const queryOpts: { limit: number; skip: number; sort?: Record<string, 1 | -1> } = {
    limit: pageSize,
    skip,
  };
  if (opts.sort !== undefined) queryOpts.sort = opts.sort;

  const [items, total] = await Promise.all([
    repo.queryMany<T>(collection, filter, ctx, queryOpts),
    repo.count(collection, filter, ctx),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}
