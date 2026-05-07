/**
 * Spec 026 — WhatsApp conversation pricing.
 *
 * Meta bills per CONVERSATION, not per message. A conversation is a
 * 24-hour window opened by either:
 *   - a customer message → "service" category (first 1000/month free in IN)
 *   - a business-initiated template → category determined by the template
 *     (marketing / utility / authentication)
 *
 * Within a single conversation, all messages are free.
 *
 * Rates below are in **paise** (1/100th of an INR), India region only,
 * as of late 2026. We store paise (integers) to avoid floating-point
 * arithmetic — same pattern as `aiUsage.costInr`.
 *
 * When Meta publishes new rates, update this file and ship a small
 * spec note. The dashboard reads from here, so a single edit
 * propagates everywhere.
 */
import type { WhatsappCategory } from '../db/schema.js';

/**
 * Paise per conversation, India region. Marketing is the most expensive
 * category; authentication the cheapest. Service is free up to 1000/month
 * (we record service conversations but don't multiply by RATE_PAISE).
 */
export const CONVERSATION_RATE_PAISE: Record<WhatsappCategory, number> = {
  // Customer-initiated; 1000 free per WABA per month, then ~₹0.27 each.
  service: 27,
  // Order updates, appointment reminders, etc.
  utility: 27,
  // Promotional content; highest cost.
  marketing: 83,
  // OTP / verification; lowest cost.
  authentication: 18,
};

/**
 * Free service-conversation allowance per WABA per month (India tier).
 * Conversations counted in `whatsappCosts.conversationsByCategory.service`
 * up to this number are not billed.
 */
export const SERVICE_FREE_TIER_PER_MONTH = 1000;

/**
 * Compute the estimated paise spent for a given conversation count by
 * category. Service conversations are subtracted by the free-tier
 * allowance before being multiplied.
 */
export function estimateMonthlyCostPaise(
  conversationsByCategory: Record<WhatsappCategory, number>,
): number {
  const billableService = Math.max(
    0,
    conversationsByCategory.service - SERVICE_FREE_TIER_PER_MONTH,
  );
  return (
    billableService * CONVERSATION_RATE_PAISE.service +
    conversationsByCategory.utility * CONVERSATION_RATE_PAISE.utility +
    conversationsByCategory.marketing * CONVERSATION_RATE_PAISE.marketing +
    conversationsByCategory.authentication * CONVERSATION_RATE_PAISE.authentication
  );
}
