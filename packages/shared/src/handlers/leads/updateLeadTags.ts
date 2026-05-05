/**
 * Spec 024 / Phase 4.4 — edit a lead's tags.
 *
 * Tags are tenant-defined free-text labels (`leads.tags: string[]`).
 * This handler offers three modes:
 *  - `tags: string[]` (replace) — set the entire tag list
 *  - `add: string[]` — union with existing tags
 *  - `remove: string[]` — remove specified tags
 *
 * Tags are normalised: trimmed, lowercased, deduped, and capped at 64
 * chars + 32 tags per lead. Empty/whitespace-only tags are dropped.
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { Lead } from '../../types/tenant.js';

const MAX_TAG_LENGTH = 64;
const MAX_TAGS_PER_LEAD = 32;

export interface UpdateLeadTagsInput {
  leadId: string;
  /** Replace the entire tag list. Mutually exclusive with add/remove. */
  tags?: string[];
  /** Union with existing tags. Mutually exclusive with `tags`. */
  add?: string[];
  /** Remove specific tags. Mutually exclusive with `tags`. */
  remove?: string[];
}

export interface UpdateLeadTagsResult {
  leadId: string;
  tags: string[];
}

function normaliseTag(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (t === '') return null;
  return t.slice(0, MAX_TAG_LENGTH);
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export async function updateLeadTags(
  ctx: Ctx,
  input: UpdateLeadTagsInput,
): Promise<UpdateLeadTagsResult> {
  // Validate input shape: exactly one of `tags`, `add`, `remove` is meaningful.
  const usingReplace = Array.isArray(input.tags);
  const usingAdd = Array.isArray(input.add) && input.add.length > 0;
  const usingRemove = Array.isArray(input.remove) && input.remove.length > 0;
  const opCount = (usingReplace ? 1 : 0) + (usingAdd ? 1 : 0) + (usingRemove ? 1 : 0);
  if (opCount === 0) {
    throw new Error('updateLeadTags: provide tags / add / remove');
  }
  if (usingReplace && (usingAdd || usingRemove)) {
    throw new Error('updateLeadTags: tags is mutually exclusive with add/remove');
  }

  // Load the existing lead (cross-tenant via repo).
  const lead = await repo.queryOne<Lead>('leads', { _id: input.leadId }, ctx);
  if (lead === null) {
    throw new Error('lead not found or not owned by this tenant');
  }

  const existing = lead.tags ?? [];
  let next: string[];

  if (usingReplace) {
    const cleaned = (input.tags ?? []).map(normaliseTag).filter((t): t is string => t !== null);
    next = dedupe(cleaned);
  } else {
    next = [...existing];
    if (usingAdd) {
      const toAdd = (input.add ?? []).map(normaliseTag).filter((t): t is string => t !== null);
      next = dedupe([...next, ...toAdd]);
    }
    if (usingRemove) {
      const toRemove = new Set(
        (input.remove ?? []).map(normaliseTag).filter((t): t is string => t !== null),
      );
      next = next.filter((t) => !toRemove.has(t));
    }
  }

  // Cap to 32 tags. We truncate from the END so older tags survive
  // (newest-added are truncated). Tenants who hit this cap can use
  // remove first.
  if (next.length > MAX_TAGS_PER_LEAD) {
    next = next.slice(0, MAX_TAGS_PER_LEAD);
  }

  await repo.updateOne('leads', { _id: input.leadId }, { $set: { tags: next } }, ctx);

  return { leadId: input.leadId, tags: next };
}
