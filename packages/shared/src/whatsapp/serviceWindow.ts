/**
 * Spec 026 — WhatsApp 24-hour service window math.
 *
 * Meta's rule: an incoming message from a customer opens a 24-hour
 * window during which the business can send freeform replies. After
 * 24 hours, only pre-approved template messages are allowed.
 *
 * This module is pure functions — no I/O. The caller passes
 * `lastInboundAt` (read from `leads.lastWhatsappInboundAt`) and we
 * return whether sending freeform is currently allowed.
 *
 * Why pure functions, not a class on the lead row:
 *   - Trivial to unit-test (no DB stub needed).
 *   - Same primitive used by send-time enforcement AND by the UI
 *     "reply window: 18h left" indicator.
 */

export const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

export type WindowState =
  | { kind: 'in-window'; expiresAt: Date; remainingMs: number }
  | { kind: 'out-of-window'; lastInboundAt: Date | null };

/**
 * Compute the current window state given the last inbound timestamp.
 *
 * @param lastInboundAt The timestamp of the customer's last inbound
 *   message, or null if they've never messaged us.
 * @param now Override the current time (for tests). Defaults to now.
 */
export function computeWindowState(
  lastInboundAt: Date | null | undefined,
  now: Date = new Date(),
): WindowState {
  if (lastInboundAt === null || lastInboundAt === undefined) {
    return { kind: 'out-of-window', lastInboundAt: null };
  }
  const elapsedMs = now.getTime() - lastInboundAt.getTime();
  if (elapsedMs >= WINDOW_DURATION_MS) {
    return { kind: 'out-of-window', lastInboundAt };
  }
  if (elapsedMs < 0) {
    // Inbound timestamp in the future — clock skew or bug. Treat as
    // out-of-window to be safe (don't send freeform when state is
    // suspect).
    return { kind: 'out-of-window', lastInboundAt };
  }
  return {
    kind: 'in-window',
    expiresAt: new Date(lastInboundAt.getTime() + WINDOW_DURATION_MS),
    remainingMs: WINDOW_DURATION_MS - elapsedMs,
  };
}

/**
 * Convenience: is freeform sending allowed right now?
 */
export function canSendFreeform(
  lastInboundAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return computeWindowState(lastInboundAt, now).kind === 'in-window';
}

/**
 * Format remaining window time for UI display. "23h 45m" / "12m" / "expired".
 */
export function formatRemaining(state: WindowState): string {
  if (state.kind === 'out-of-window') return 'expired';
  const totalMinutes = Math.floor(state.remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
