import type { Metadata } from 'next';

/**
 * Spec 012 — home page. Static (no getCtx, no DB). Replaces the old
 * placeholder at app/page.tsx.
 */
export const metadata: Metadata = {
  title: 'Instagram DM automation for Indian creators',
  description:
    'BloomDM replies to Instagram comments and stories with templated or AI-generated DMs. Flat INR pricing, true unlimited accounts, lead capture inside DMs.',
};

export default function HomePage() {
  return (
    <div data-testid="home-page">
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-600">
          Made in India · No bots, no scraping
        </p>
        <h1 className="mb-5 text-4xl font-bold sm:text-5xl">
          Instagram DM automation that actually grows revenue
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600">
          Auto-reply to comments and stories with templated or AI-generated DMs. Capture leads
          inside conversations. Flat INR pricing, native AI on day one, true unlimited accounts on
          Agency.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="/signup"
            className="rounded bg-black px-6 py-3 text-base text-white hover:opacity-90"
            data-testid="hero-cta-signup"
          >
            Start free
          </a>
          <a
            href="/pricing"
            className="rounded border px-6 py-3 text-base text-gray-700 hover:bg-gray-50"
            data-testid="hero-cta-pricing"
          >
            See pricing
          </a>
        </div>
        <p className="mt-4 text-xs text-gray-500">
          50 free DMs/day · No card required · Connect your IG Business account in 2 clicks
        </p>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-10 text-center text-3xl font-semibold">
            Built for Indian creators &amp; D2C brands
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <Feature
              title="Comment → DM in one rule"
              body="Pick keywords. Pick a post. We auto-DM commenters who match. AI-personalised or templated — your call."
            />
            <Feature
              title="True multi-account"
              body="Agency tier supports unlimited connected IG accounts. No per-seat tax. Switch tenants like Slack workspaces."
            />
            <Feature
              title="Lead capture inside DMs"
              body="When end-users reply with their email or phone, we extract it onto the leads table. Export CSV anytime."
            />
            <Feature
              title="Flat INR pricing"
              body="Razorpay-native. UPI, cards, netbanking. No hidden USD conversions, no MRR-tax surprises at month-end."
            />
            <Feature
              title="Meta-API only"
              body="No browser automation. No password collection. We use Facebook Login for Business — your account stays compliant."
            />
            <Feature
              title="DPDP-aware"
              body="One-click data export. Soft-delete with 30-day undo. India-resident infra (Mumbai region)."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center text-3xl font-semibold">How it works</h2>
        <ol className="mx-auto max-w-3xl space-y-6">
          <Step
            n={1}
            title="Connect your Instagram Business account"
            body="Two clicks via Facebook Login for Business. We never see your password."
          />
          <Step
            n={2}
            title="Define a keyword + reply"
            body="Pick a post (or all posts), a keyword like LINK, and either a templated DM or an AI prompt with brand-voice tone."
          />
          <Step
            n={3}
            title="Watch leads flow in"
            body="Every triggered DM logs to your dashboard. Replies with email/phone become leads automatically."
          />
        </ol>
      </section>

      <section className="bg-black py-16 text-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-semibold">Ready to automate your DMs?</h2>
          <p className="mb-6 text-gray-300">Free tier covers 50 DMs/day. No card required.</p>
          <a
            href="/signup"
            className="inline-block rounded bg-white px-6 py-3 text-base text-black hover:opacity-90"
            data-testid="footer-cta-signup"
          >
            Create your account
          </a>
        </div>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded border bg-white p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
        {n}
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-gray-600">{body}</p>
      </div>
    </li>
  );
}
