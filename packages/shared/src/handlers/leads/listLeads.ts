/**
 * Spec 009 — list / export leads for a tenant.
 *
 * Plain JSON response by default; CSV via `format=csv`. CSV is built
 * by hand (RFC 4180 minimal-correct) — pulling in a CSV library would
 * be overkill for 7 columns.
 */
import type { Ctx } from '../../auth/ctx.js';
import { type Paginated, paginate } from '../../db/pagination.js';
import type { Lead } from '../../types/tenant.js';

export interface ListLeadsOptions {
  igAccountId?: string;
  page?: number;
  pageSize?: number;
  /**
   * Backwards-compat shim for the CSV-export path which passed a flat
   * `limit`. When set, treated as `pageSize` with `page=1`. Prefer
   * `page` + `pageSize` for new callers.
   */
  limit?: number;
}

export interface LeadSummary {
  _id: string;
  igUserId: string;
  igUsername: string | null;
  email: string | null;
  phone: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  tags: string[];
}

function toSummary(r: Lead): LeadSummary {
  return {
    _id: r._id,
    igUserId: r.igUserId,
    igUsername: r.igUsername ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    tags: r.tags,
  };
}

/**
 * Spec 020 / Phase 2.3 — paginated leads list. Page is 1-indexed.
 */
export async function listLeads(
  ctx: Ctx,
  opts: ListLeadsOptions = {},
): Promise<Paginated<LeadSummary>> {
  const filter: Record<string, unknown> = {};
  if (opts.igAccountId !== undefined) filter.igAccountId = opts.igAccountId;

  const paginateOpts: Parameters<typeof paginate<Lead>>[3] = { sort: { lastSeenAt: -1 } };
  if (opts.page !== undefined) paginateOpts.page = opts.page;
  // Back-compat: if a caller (notably the CSV export) passed `limit`,
  // honour it as a single big page.
  const pageSize = opts.pageSize ?? opts.limit;
  if (pageSize !== undefined) paginateOpts.pageSize = pageSize;

  const result = await paginate<Lead>('leads', filter, ctx, paginateOpts);

  return {
    ...result,
    items: result.items.map(toSummary),
  };
}

/**
 * Escape a single CSV cell per RFC 4180 — wrap in quotes if it
 * contains a quote, comma, or newline; double any embedded quotes.
 */
function csvEscape(value: string): string {
  if (/["\n,\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function leadsToCsv(leads: LeadSummary[]): string {
  const header = [
    'igUserId',
    'igUsername',
    'email',
    'phone',
    'firstSeenAt',
    'lastSeenAt',
    'tags',
  ].join(',');
  const lines = [header];
  for (const l of leads) {
    lines.push(
      [
        csvEscape(l.igUserId),
        csvEscape(l.igUsername ?? ''),
        csvEscape(l.email ?? ''),
        csvEscape(l.phone ?? ''),
        l.firstSeenAt.toISOString(),
        l.lastSeenAt.toISOString(),
        csvEscape(l.tags.join('|')),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
