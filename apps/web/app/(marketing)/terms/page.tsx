import type { Metadata } from 'next';

/**
 * Spec 013 — terms of service. Static markdown-as-JSX.
 */
export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    "BloomDM's terms of service. Acceptable use, billing, liability, and termination rules for Indian creators and agencies.",
};

const LAST_UPDATED = '2026-05-05';

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-gray" data-testid="terms-page">
      <h1 className="text-4xl font-bold">Terms of Service</h1>
      <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>

      <h2 className="mt-8 text-2xl font-semibold">1. Acceptance</h2>
      <p className="mt-2 text-gray-700">
        By creating an BloomDM workspace you (&quot;you&quot;, &quot;tenant&quot;) accept these
        Terms and our Privacy Policy. If you don&apos;t agree, don&apos;t use the service.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">2. What we provide</h2>
      <p className="mt-2 text-gray-700">
        Software-as-a-service that automates Instagram comment-to-DM and story-reply replies via the
        official Meta Graph API. We never scrape, never automate via browser, never store Instagram
        passwords.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">3. Acceptable use</h2>
      <p className="mt-2 text-gray-700">You agree NOT to:</p>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>Use BloomDM to send spam, harassment, or unlawful content.</li>
        <li>
          Send bulk DMs to Instagram users who have not opted in by interacting with your business
          account.
        </li>
        <li>Capture personal data of Instagram users without lawful basis.</li>
        <li>
          Attempt to bypass our rate limits, the Meta Graph API rate limits, or the 24-hour
          messaging window.
        </li>
        <li>Resell or sub-license BloomDM without a written Agency agreement.</li>
        <li>Reverse-engineer or scrape BloomDM itself.</li>
      </ul>
      <p className="mt-2 text-gray-700">
        Violations may result in immediate suspension. Repeat violations terminate your workspace.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">4. Your responsibilities</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          You are the Data Fiduciary for personal data you capture from your Instagram audience. We
          process it on your instructions.
        </li>
        <li>You comply with Meta&apos;s Platform Terms and the Instagram Community Guidelines.</li>
        <li>
          You keep your workspace credentials secure. We are not liable for damage caused by leaked
          credentials.
        </li>
        <li>
          You provide a meaningful consent and unsubscribe path inside your DM flows where required.
        </li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">5. Billing</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          Free tier requires no payment. Paid tiers are billed monthly via Razorpay in INR; GST
          extra where applicable.
        </li>
        <li>
          Subscriptions auto-renew. Cancel anytime in Settings — access continues until the end of
          the current billing period.
        </li>
        <li>
          Refunds are not offered for partial-month usage but are considered in good faith on a
          case-by-case basis. Email{' '}
          <a href="mailto:parvinderawal@gmail.com" className="underline">
            parvinderawal@gmail.com
          </a>
          .
        </li>
        <li>
          If a charge fails we retry per Razorpay&apos;s policy. After 7 days of failed retries the
          workspace is paused.
        </li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">6. Service availability</h2>
      <p className="mt-2 text-gray-700">
        We aim for 99.5% monthly uptime on the dashboard and webhook endpoint. We do not currently
        offer a contractual SLA. We publish incidents at{' '}
        <a href="mailto:parvinderawal@gmail.com" className="underline">
          parvinderawal@gmail.com
        </a>
        .
      </p>

      <h2 className="mt-8 text-2xl font-semibold">7. Disclaimers</h2>
      <p className="mt-2 text-gray-700">
        BloomDM is provided AS-IS. We don&apos;t guarantee specific conversion rates,
        deliverability, or business outcomes. Meta may change its API at any time; we make best
        effort to keep up.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">8. Limitation of liability</h2>
      <p className="mt-2 text-gray-700">
        To the maximum extent permitted by Indian law, our aggregate liability for any claim is
        capped at the fees you paid us in the 12 months preceding the claim.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">9. Termination</h2>
      <p className="mt-2 text-gray-700">
        You may delete your workspace anytime in Settings → Privacy. We may terminate workspaces for
        material breach of these Terms with 7 days notice (immediate for spam / abuse).
      </p>

      <h2 className="mt-8 text-2xl font-semibold">10. Governing law</h2>
      <p className="mt-2 text-gray-700">
        These Terms are governed by the laws of India. Disputes are subject to the exclusive
        jurisdiction of the courts at Mumbai.
      </p>

      <p className="mt-10 text-sm text-gray-500">
        Questions? Email{' '}
        <a href="mailto:parvinderawal@gmail.com" className="underline">
          parvinderawal@gmail.com
        </a>
        .
      </p>
    </article>
  );
}
