/**
 * Spec 005 §7.1 — eventId synthesis tests.
 */
import { describe, expect, it } from 'vitest';
import { parseWebhookEvents } from './eventId.js';

describe('parseWebhookEvents', () => {
  it('extracts comment events from changes[]', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'ig-user-123',
          time: 1700000000,
          changes: [
            {
              field: 'comments',
              value: { id: 'comment-456', text: 'great post!' },
            },
          ],
        },
      ],
    };
    const events = parseWebhookEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('comment');
    expect(events[0]?.igUserId).toBe('ig-user-123');
    expect(events[0]?.metaEventId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('extracts message events from messaging[]', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'ig-user-123',
          messaging: [
            {
              sender: { id: 'user-789' },
              timestamp: 1700000000,
              message: { mid: 'msg-abc', text: 'hello' },
            },
          ],
        },
      ],
    };
    const events = parseWebhookEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('message');
  });

  it('extracts message_reactions as messageReaction kind', () => {
    const payload = {
      object: 'instagram',
      entry: [
        {
          id: 'ig-user-123',
          messaging: [
            {
              sender: { id: 'user-789' },
              timestamp: 1700000000,
              reaction: { reaction: 'like', mid: 'msg-abc' },
            },
          ],
        },
      ],
    };
    const events = parseWebhookEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('messageReaction');
  });

  it('produces same event id for identical payloads (idempotency)', () => {
    const payload = {
      entry: [
        {
          id: 'ig-1',
          time: 100,
          changes: [{ field: 'comments', value: { id: 'c-1', text: 'a' } }],
        },
      ],
    };
    const a = parseWebhookEvents(payload)[0]?.metaEventId;
    const b = parseWebhookEvents(payload)[0]?.metaEventId;
    expect(a).toBe(b);
  });

  it('produces different event ids for different payloads', () => {
    const a = parseWebhookEvents({
      entry: [{ id: 'ig-1', changes: [{ field: 'comments', value: { id: 'c-1' } }] }],
    });
    const b = parseWebhookEvents({
      entry: [{ id: 'ig-1', changes: [{ field: 'comments', value: { id: 'c-2' } }] }],
    });
    expect(a[0]?.metaEventId).not.toBe(b[0]?.metaEventId);
  });

  it('returns empty array for non-entry payloads', () => {
    expect(parseWebhookEvents({})).toEqual([]);
    expect(parseWebhookEvents(null)).toEqual([]);
    expect(parseWebhookEvents({ entry: [] })).toEqual([]);
  });

  it('skips unknown field types', () => {
    const events = parseWebhookEvents({
      entry: [{ id: 'x', changes: [{ field: 'unknown_field', value: { id: '1' } }] }],
    });
    expect(events).toEqual([]);
  });

  it('handles multiple entries with multiple changes', () => {
    const events = parseWebhookEvents({
      entry: [
        {
          id: 'ig-1',
          changes: [
            { field: 'comments', value: { id: 'c-1' } },
            { field: 'mentions', value: { id: 'm-1' } },
          ],
        },
        {
          id: 'ig-2',
          changes: [{ field: 'comments', value: { id: 'c-2' } }],
        },
      ],
    });
    expect(events).toHaveLength(3);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('comment');
    expect(kinds).toContain('mention');
  });
});
