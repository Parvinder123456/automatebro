import type { Metadata } from 'next';

/**
 * Spec 013 — privacy policy. Static markdown-as-JSX. Updates require
 * a redeploy; legal copy changes are rare and need version control.
 */
export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    "AutomateBro's privacy policy. How we collect, store, and process personal data. DPDP-aligned for Indian users; GDPR-compatible posture for EU users.",
};

const LAST_UPDATED = '2026-05-05';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-gray" data-testid="privacy-page">
      <h1 className="text-4xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>

      <h2 className="mt-8 text-2xl font-semibold">1. Who we are</h2>
      <p className="mt-2 text-gray-700">
        AutomateBro is an Instagram DM automation platform operated from India. For the purposes of
        the Digital Personal Data Protection Act 2023 (&quot;DPDP&quot;), AutomateBro is a Data
        Fiduciary for the personal data of its tenant users, and a Data Processor for the personal
        data of Instagram end users that tenants choose to capture via our platform.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">2. What we collect</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          <strong>Tenant account data:</strong> email, hashed password (via Supabase Auth),
          workspace name, billing details (via Razorpay).
        </li>
        <li>
          <strong>Instagram integration data:</strong> connected account ID, username, page ID,
          encrypted access tokens (AES-256-GCM at rest). We never see or store your Instagram
          password.
        </li>
        <li>
          <strong>Lead data:</strong> Instagram handles and email/phone numbers that end users send
          to your DMs in response to automations you configure. The lawful basis is your consent on
          the workspace form confirming you have authority to process this data.
        </li>
        <li>
          <strong>Operational logs:</strong> webhook events, outbound DM attempts, error traces. We
          never log DM contents in plain text.
        </li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">3. What we don&apos;t collect</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>Instagram passwords — we use Facebook Login for Business OAuth.</li>
        <li>
          End-users&apos; follower lists, DM history outside our automations, or any data Meta does
          not expose.
        </li>
        <li>Browsing or behavioural tracking on our marketing site.</li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">4. Where data lives</h2>
      <p className="mt-2 text-gray-700">
        Postgres database: Supabase, region <code>ap-south-1</code> (Mumbai). Logs: Axiom (US).
        Error tracking: Sentry (US). Analytics: PostHog (EU). All personal data of Indian residents
        stays in India for the primary database; aggregated logs may transit other regions for
        operational purposes only.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">5. Your rights (DPDP §11–§13)</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          <strong>Right to access:</strong> download a JSON copy of all your workspace data anytime
          via Settings → Privacy → Download my data.
        </li>
        <li>
          <strong>Right to correction:</strong> edit your workspace name, email, and connected
          accounts directly in the dashboard.
        </li>
        <li>
          <strong>Right to erasure:</strong> request deletion via Settings → Privacy → Delete
          workspace. Soft-deleted immediately; hard-deleted 30 days later. Email{' '}
          <a href="mailto:hello@automatebro.com" className="underline">
            hello@automatebro.com
          </a>{' '}
          to cancel before the 30-day window closes.
        </li>
        <li>
          <strong>Right to grievance redressal:</strong> our Grievance Officer can be reached at{' '}
          <a href="mailto:hello@automatebro.com" className="underline">
            hello@automatebro.com
          </a>
          . We respond within 30 days.
        </li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">6. Sub-processors</h2>
      <p className="mt-2 text-gray-700">We share data with the following sub-processors:</p>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>Supabase (database, auth) — Mumbai, India.</li>
        <li>Upstash (Redis queue) — Mumbai, India.</li>
        <li>Vercel (hosting) — global edge, Mumbai primary.</li>
        <li>Railway (worker hosting) — Asia-Southeast.</li>
        <li>OpenAI (AI replies; only when tenant enables AI mode).</li>
        <li>Razorpay (billing).</li>
        <li>Resend (transactional email).</li>
        <li>Sentry, Axiom, PostHog (operational observability).</li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">7. Cookies</h2>
      <p className="mt-2 text-gray-700">
        We use first-party cookies for sign-in only. We do not use third-party tracking cookies or
        fingerprinting on our marketing site. Cookies set by sub-processors (e.g. Supabase Auth) are
        strictly necessary and cannot be disabled.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">8. Retention</h2>
      <p className="mt-2 text-gray-700">
        Active workspace data is retained for the life of the workspace. Deleted workspaces are
        hard-deleted 30 days after the deletion request. Operational logs are retained 90 days.
        Aggregated analytics are retained indefinitely in non-personal form.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">9. Security</h2>
      <p className="mt-2 text-gray-700">
        Tokens are encrypted at rest with AES-256-GCM, with per-row Additional Authenticated Data
        binding ciphertext to identity. Webhook signatures verified via HMAC-SHA256. Database access
        is scoped to tenant via three application-layer guards. We disclose breaches to affected
        tenants and regulators within 72 hours per DPDP §8(6).
      </p>

      <h2 className="mt-8 text-2xl font-semibold">10. Changes</h2>
      <p className="mt-2 text-gray-700">
        We may update this policy. Material changes are emailed to all active workspace owners 14
        days before they take effect.
      </p>

      <p className="mt-10 text-sm text-gray-500">
        Questions? Email{' '}
        <a href="mailto:hello@automatebro.com" className="underline">
          hello@automatebro.com
        </a>
        .
      </p>
    </article>
  );
}
