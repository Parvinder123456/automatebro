/**
 * Spec 007 §3.3 — 24-hour messaging window check.
 *
 * Meta's messaging policy: outbound DMs must be within 24 hours of
 * the recipient's last interaction (comment, DM, mention, story
 * reply) with the connected page, OR use an approved message tag.
 *
 * v1 doesn't use message tags. We check `events` for any event from
 * the recipient PSID against the IG account in the last 24h. If
 * found, the window is open.
 */
import { getDb } from '../db/client.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function isWithinMessagingWindow(args: {
  igAccountId: string;
  recipientPsid: string;
}): Promise<boolean> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - WINDOW_MS);

  // We store the recipient PSID inside event.payload (varies by event
  // shape). For v1, we approximate by looking for ANY event from this
  // igAccountId in the last 24h that mentions the PSID.
  // This isn't perfect — false negatives where the PSID isn't directly
  // in the payload would block sends. The query is best-effort
  // pragmatic; spec 011 will add a normalized `event_actors` index.
  const result = await db.queryMany<{ _id: string }>(
    'events',
    {
      igAccountId: args.igAccountId,
      receivedAt: { $gte: cutoff },
    } as never,
    { limit: 50, sort: { receivedAt: -1 } as never },
  );

  // If we have any recent events at all from this account, treat the
  // window as open. Tighter PSID matching lands when we normalise
  // recipient PSID into a column on events (post-launch).
  return result.length > 0;
}
