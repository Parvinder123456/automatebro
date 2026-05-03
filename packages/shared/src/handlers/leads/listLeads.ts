/**
 * Spec 009 — list / export leads for a tenant.
 *
 * Plain JSON response by default; CSV via `format=csv`. CSV is built
 * by hand (RFC 4180 minimal-correct) — pulling in a CSV library would
 * be overkill for 7 columns.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { Lead } from '../../types/tenant.js';

export interface ListLeadsOptions {
  limit?: number;
  igAccountId?: string;
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

export async function listLeads(ctx: Ctx, opts: ListLeadsOptions = {}): Promise<LeadSummary[]> {
  const filter: Record<string, unknown> = {};
  if (opts.igAccountId !== undefined) filter.igAccountId = opts.igAccountId;
  const rows = await repo.queryMany<Lead>('leads', filter, ctx, {
    limit: opts.limit ?? 1000,
    sort: { lastSeenAt: -1 } as never,
  });
  return rows.map((r) => ({
    _id: r._id,
    igUserId: r.igUserId,
    igUsername: r.igUsername ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    tags: r.tags,
  }));
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
