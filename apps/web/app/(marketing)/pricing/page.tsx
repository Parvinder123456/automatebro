import type { Metadata } from 'next';

/**
 * Spec 012 §3.6 — pricing page. Static, four tiers. Razorpay wiring
 * lands in spec 010; for now the CTAs link to /signup?plan=<slug>
 * which the signup flow ignores.
 */
export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Flat INR pricing. Free tier with 50 DMs/day, Starter at ₹999/mo, Growth at ₹2,499/mo, Agency at ₹6,999/mo with unlimited IG accounts.',
};

interface Tier {
  slug: string;
  name: string;
  priceInr: number;
  cadence: string;
  blurb: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const TIERS: Tier[] = [
  {
    slug: 'free',
    name: 'Free',
    priceInr: 0,
    cadence: 'forever',
    blurb: 'Try it on a single account.',
    features: [
      '1 Instagram account',
      '50 DMs / day',
      'Static templates only',
      'Lead capture',
      'CSV export',
      'Email support',
    ],
    cta: 'Start free',
  },
  {
    slug: 'starter',
    name: 'Starter',
    priceInr: 999,
    cadence: '/month',
    blurb: 'For solo creators who want AI replies.',
    features: [
      '1 Instagram account',
      'Unlimited DMs (within Meta limits)',
      'AI-generated replies',
      'Lead capture + CSV export',
      'Comment auto-reply',
      'Email support',
    ],
    cta: 'Start Starter',
    highlighted: true,
  },
  {
    slug: 'growth',
    name: 'Growth',
    priceInr: 2499,
    cadence: '/month',
    blurb: 'For growing brands with multiple handles.',
    features: [
      '5 Instagram accounts',
      'Unlimited DMs',
      'AI replies with brand-voice tones',
      'Lead capture + CSV export',
      'Story-reply automation',
      'Priority email support',
    ],
    cta: 'Start Growth',
  },
  {
    slug: 'agency',
    name: 'Agency',
    priceInr: 6999,
    cadence: '/month',
    blurb: 'For agencies running client accounts.',
    features: [
      'Unlimited Instagram accounts',
      'Unlimited DMs',
      'All AI features',
      'Lead capture + CSV export',
      'Story replies + mention triggers',
      'Priority chat support',
    ],
    cta: 'Start Agency',
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16" data-testid="pricing-page">
      <div className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold">Simple, flat INR pricing</h1>
        <p className="text-gray-600">No per-seat tax. No surprise USD charges. Cancel anytime.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="pricing-tiers">
        {TIERS.map((tier) => (
          <PricingCard key={tier.slug} tier={tier} />
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-gray-500">
        Prices in INR. GST extra where applicable. Razorpay-secured payments.
      </p>
    </div>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <div
      className={`flex flex-col rounded border p-6 ${
        tier.highlighted === true ? 'border-black ring-1 ring-black' : 'bg-white'
      }`}
      data-testid={`pricing-tier-${tier.slug}`}
    >
      <h2 className="text-xl font-semibold">{tier.name}</h2>
      <p className="mt-1 text-sm text-gray-600">{tier.blurb}</p>
      <p className="mt-4">
        <span className="text-3xl font-bold">₹{tier.priceInr.toLocaleString('en-IN')}</span>
        <span className="text-sm text-gray-500"> {tier.cadence}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-2 text-sm text-gray-700">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <a
        href={`/signup?plan=${tier.slug}`}
        className={`mt-6 block rounded px-4 py-2 text-center text-sm ${
          tier.highlighted === true
            ? 'bg-black text-white hover:opacity-90'
            : 'border text-gray-800 hover:bg-gray-50'
        }`}
        data-testid={`pricing-cta-${tier.slug}`}
      >
        {tier.cta}
      </a>
    </div>
  );
}
