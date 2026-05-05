/**
 * Spec 005 §3.2 — synthesise a stable event id for Meta webhook deliveries.
 *
 * Meta does NOT send a top-level event id we can use directly. We
 * synthesise one by SHA-256 hashing the canonical fields of the
 * change object — different shapes need different rules.
 *
 * The output goes into events.metaEventId which has a UNIQUE constraint.
 * On retried deliveries the synthesised id is the same → INSERT fails →
 * we no-op and respond 200.
 */
import { createHash } from 'node:crypto';
import type { EventKind } from '../types/tenant.js';

export interface MetaEntry {
  id: string;
  time?: number;
  changes?: MetaChange[];
  messaging?: MetaMessaging[];
}

export interface MetaChange {
  field: string;
  value: Record<string, unknown>;
}

export interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string };
  reaction?: { reaction?: string; mid?: string };
}

export interface ParsedEvent {
  metaEventId: string;
  kind: EventKind;
  igUserId: string | null;
  payload: unknown;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Map a Meta `field` (e.g. "comments", "messages") to our internal
 * EventKind. Returns null for fields we don't yet handle so callers
 * can skip them.
 */
function fieldToKind(field: string): EventKind | null {
  switch (field) {
    case 'comments':
      return 'comment';
    case 'messages':
      return 'message';
    case 'message_reactions':
      return 'messageReaction';
    case 'mentions':
      return 'mention';
    default:
      return null;
  }
}

/**
 * Extract all parseable events from a Meta webhook payload. The payload
 * shape (`object`/`entry[]`/`changes[]` or `entry[]/messaging[]`) varies
 * by which subscription type fired.
 *
 * For story replies (which arrive as `messaging` envelope), we map to
 * 'storyReply' kind; for comments/mentions arriving as `changes`, we map
 * via fieldToKind.
 */
export function parseWebhookEvents(payload: unknown): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  const root = (payload ?? {}) as { object?: string; entry?: MetaEntry[] };
  if (!Array.isArray(root.entry)) return out;

  for (const entry of root.entry) {
    const igUserId = typeof entry.id === 'string' ? entry.id : null;

    // changes[]-style events (comments, mentions, reactions on posts)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const kind = fieldToKind(change.field);
        if (kind === null) continue;
        const valueId =
          (change.value as { id?: string })?.id ??
          (change.value as { comment_id?: string })?.comment_id ??
          (change.value as { media?: { id?: string } })?.media?.id ??
          'unknown';
        const stableInput = `${entry.id}|${entry.time ?? ''}|${change.field}|${valueId}|${JSON.stringify(change.value)}`;
        out.push({
          metaEventId: sha256Hex(stableInput),
          kind,
          igUserId,
          payload: { entry: { id: entry.id, time: entry.time }, change },
        });
      }
    }

    // messaging[]-style events (DMs, story replies, message reactions)
    if (Array.isArray(entry.messaging)) {
      for (const msg of entry.messaging) {
        // Spec 018 / Phase 1.4 — story replies arrive with
        // `message.reply_to.story` set. Tag them as 'storyReply' so the
        // dispatcher can route to processStoryReplyEvent. Reactions stay
        // 'messageReaction'; everything else is a plain 'message'.
        const isReaction = msg.reaction !== undefined;
        const isStoryReply =
          !isReaction &&
          (msg as { message?: { reply_to?: { story?: unknown } } }).message?.reply_to?.story !==
            undefined;
        const kind: EventKind = isReaction
          ? 'messageReaction'
          : isStoryReply
            ? 'storyReply'
            : 'message';
        const mid = msg.message?.mid ?? msg.reaction?.mid ?? 'no-mid';
        const stableInput = `${entry.id}|${msg.timestamp ?? ''}|${msg.sender?.id ?? ''}|${mid}|${JSON.stringify(msg)}`;
        out.push({
          metaEventId: sha256Hex(stableInput),
          kind,
          igUserId,
          payload: { entry: { id: entry.id }, messaging: msg },
        });
      }
    }
  }

  return out;
}
