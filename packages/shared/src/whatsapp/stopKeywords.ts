/**
 * Spec 026 — STOP-keyword detection across en / hi / hi-en.
 *
 * Customer types one of these as a standalone message → we set
 * `whatsappOptOutAt` and refuse all future template sends. Re-engagement
 * (a non-stop message later) creates a new opt-in record.
 *
 * Detection rules:
 *   - Whole-message match (after trim+lowercase) — does NOT match if
 *     the keyword is embedded in a longer sentence ("I'll stop by
 *     tomorrow" should NOT trigger).
 *   - Two-word phrases supported via the multi-word entries below.
 *   - Devanagari text matched as-is (case-insensitive lower has no
 *     effect on Devanagari).
 *
 * Localisation note: the Hindi list was seeded by reasoning about
 * common messaging patterns. Before broad rollout, a Hindi-speaking
 * creator should review for false positives. Spec 026 §9 question 3.
 */

const STOP_KEYWORDS_EXACT: ReadonlySet<string> = new Set([
  // English — Meta's own recommended list
  'stop',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'opt out',
  'opt-out',
  'optout',
  'remove me',
  'no more',
  'no thanks',
  // Hindi (Devanagari)
  'बंद करो',
  'रुको',
  'अनसब्सक्राइब',
  'मना',
  // Hindi-English (Roman script transliteration — common in WhatsApp)
  'band karo',
  'band kar do',
  'ruko',
  'mat bhejo',
  'mat bhejna',
  'dont send',
  "don't send",
]);

/**
 * Returns true if the message body — trimmed and lower-cased — matches
 * a STOP keyword exactly. Empty / whitespace-only messages return false.
 */
export function isStopKeyword(body: string | null | undefined): boolean {
  if (body === null || body === undefined) return false;
  const normalized = body.trim().toLowerCase();
  if (normalized.length === 0) return false;
  // Reject anything longer than 32 chars — STOP messages are always
  // short. "stop following the rules and tell me the price" should not
  // trigger.
  if (normalized.length > 32) return false;
  return STOP_KEYWORDS_EXACT.has(normalized);
}
