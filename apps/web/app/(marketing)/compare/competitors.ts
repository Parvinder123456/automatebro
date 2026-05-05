/**
 * Spec 012 §3.4 — typed competitor content map. Three competitors,
 * one entry each. Used by `compare/[slug]/page.tsx`.
 */

export interface Competitor {
  slug: 'manychat' | 'linkplease' | 'linkdm';
  name: string;
  headline: string;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  verdict: string;
}

export const COMPETITORS: Record<Competitor['slug'], Competitor> = {
  manychat: {
    slug: 'manychat',
    name: 'ManyChat',
    headline: 'AutomateBro vs ManyChat',
    positioning:
      'ManyChat is a US-first, multi-channel chat marketing platform. AutomateBro is an India-first, Instagram-only DM automation platform.',
    strengths: [
      'Battle-tested visual flow builder.',
      'Multi-channel: Instagram, Messenger, WhatsApp, SMS.',
      'Large template library and partner ecosystem.',
    ],
    weaknesses: [
      'USD pricing converts unfavourably for Indian creators (effective ₹1,200+/mo on Pro).',
      'No native Razorpay / UPI billing — credit card or PayPal only.',
      'AI replies behind an extra add-on; not native to base tier.',
      'Per-contact pricing penalises viral posts.',
    ],
    verdict:
      'ManyChat fits multi-channel agencies who already pay USD subscriptions. AutomateBro fits Indian creators who want flat INR pricing, native AI, and no per-contact tax.',
  },
  linkplease: {
    slug: 'linkplease',
    name: 'LinkPlease',
    headline: 'AutomateBro vs LinkPlease',
    positioning:
      'LinkPlease is an India-based comment-to-DM tool with INR pricing. AutomateBro is the same category with broader feature set and explicit DPDP posture.',
    strengths: ['INR pricing.', 'Simple comment-to-DM setup.', 'Familiar to many Indian creators.'],
    weaknesses: [
      'No native AI replies — templates only.',
      'Limited multi-account support; per-account upgrade tax.',
      'No published DPDP / data export workflow.',
      'No story-reply or mention-trigger automation.',
    ],
    verdict:
      'LinkPlease covers basic comment-to-DM. AutomateBro adds native AI on day one, true unlimited accounts on Agency, story-reply triggers, and one-click DPDP-compliant export.',
  },
  linkdm: {
    slug: 'linkdm',
    name: 'LinkDM',
    headline: 'AutomateBro vs LinkDM',
    positioning:
      'LinkDM offers comment-to-DM automation with templated replies. AutomateBro is a creator-first alternative with AI-native replies and multi-account economics.',
    strengths: [
      'Established product with onboarding tooling.',
      'Templates for common conversion funnels.',
    ],
    weaknesses: [
      'AI replies are paid add-on, not base feature.',
      'Multi-account pricing scales steeply.',
      'No published lead-capture + CSV export workflow.',
      'No India-resident infra commitment in pricing pages.',
    ],
    verdict:
      'LinkDM is a viable comment-to-DM tool. AutomateBro wins on AI-included pricing, INR-flat tiers, and DPDP-aware lead capture.',
  },
};

export function getCompetitor(slug: string): Competitor | null {
  if (slug === 'manychat' || slug === 'linkplease' || slug === 'linkdm') {
    return COMPETITORS[slug];
  }
  return null;
}
