import type { Metadata } from 'next';

/**
 * Spec 013 — Data Processing Addendum. Available as a public page so
 * tenants can reference it without signing a separate document for v1.
 * Agency-tier customers may request a counter-signed copy.
 */
export const metadata: Metadata = {
  title: 'Data Processing Addendum',
  description:
    "AutomateBro's Data Processing Addendum (DPA) for tenants. DPDP-aligned, GDPR-compatible. Sub-processor list and data flow disclosures.",
};

const LAST_UPDATED = '2026-05-05';

export default function DpaPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-gray" data-testid="dpa-page">
      <h1 className="text-4xl font-bold">Data Processing Addendum</h1>
      <p className="text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6 text-gray-700">
        This Data Processing Addendum (&quot;DPA&quot;) supplements our Terms of Service and applies
        whenever AutomateBro (&quot;Processor&quot;) processes personal data on behalf of you
        (&quot;Controller&quot; or &quot;Tenant&quot;) under the Digital Personal Data Protection
        Act 2023 (&quot;DPDP&quot;) of India, and where applicable under the GDPR for EU-resident
        end users.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">1. Roles</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          <strong>Tenant:</strong> Data Fiduciary (DPDP) / Data Controller (GDPR) for personal data
          of Instagram end users captured via AutomateBro automations the Tenant configures.
        </li>
        <li>
          <strong>AutomateBro:</strong> Data Processor under both frameworks. We process personal
          data only on Tenant&apos;s documented instructions, namely the automation rules and data
          export/delete requests issued through the dashboard or API.
        </li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">2. Subject matter and duration</h2>
      <p className="mt-2 text-gray-700">
        Subject matter: comment-to-DM automation, story-reply automation, AI-generated DM replies,
        and lead capture inside DMs. Duration: for the term of the Tenant&apos;s active workspace
        plus 30 days (the soft-delete window).
      </p>

      <h2 className="mt-8 text-2xl font-semibold">3. Categories of data subjects and data</h2>
      <p className="mt-2 text-gray-700">
        Data subjects: Tenant&apos;s authorised users; Instagram end users who interact with
        Tenant&apos;s connected accounts. Categories: IG handles, page IDs, content of public
        comments and inbound DMs, email and phone numbers volunteered in DM replies.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">4. Sub-processors</h2>
      <p className="mt-2 text-gray-700">
        Tenant authorises the sub-processors listed on our Privacy Policy page. We give 30
        days&apos; notice via email before adding new sub-processors that process personal data;
        Tenant may terminate if they object.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">5. Security measures</h2>
      <ul className="mt-2 space-y-2 text-gray-700">
        <li>
          AES-256-GCM encryption at rest for Instagram access tokens, with per-row Additional
          Authenticated Data binding ciphertext to identity.
        </li>
        <li>
          HMAC-SHA256 verification of every Meta and Razorpay webhook over the raw request body.
        </li>
        <li>
          Three application-layer multi-tenancy guards: Zod schema, ctx-from-session, repo prepend.
        </li>
        <li>TLS 1.2+ for all transport.</li>
        <li>Logs scrubbed of token bytes, DM contents, and email addresses (masked).</li>
      </ul>

      <h2 className="mt-8 text-2xl font-semibold">6. Data subject requests</h2>
      <p className="mt-2 text-gray-700">
        Tenants self-serve access and deletion rights via Settings → Privacy. End-user requests
        received directly by AutomateBro will be forwarded to the relevant Tenant within 5 business
        days; we do not act on end-user requests unilaterally.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">7. Breach notification</h2>
      <p className="mt-2 text-gray-700">
        We notify affected Tenants without undue delay (and within 72 hours where DPDP §8(6)
        applies) upon becoming aware of a personal data breach, with the information required to
        enable Tenant compliance.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">8. International transfers</h2>
      <p className="mt-2 text-gray-700">
        Primary database and queue infrastructure are in India. Operational logs and analytics may
        be processed outside India by sub-processors listed in §4 above; transfers are made under
        Standard Contractual Clauses or equivalent safeguards.
      </p>

      <h2 className="mt-8 text-2xl font-semibold">9. Return and deletion</h2>
      <p className="mt-2 text-gray-700">
        On workspace deletion or Tenant request, we return data via the export endpoint and delete
        all copies within 30 days, except where retention is required by Indian law.
      </p>

      <p className="mt-10 text-sm text-gray-500">
        For a counter-signed copy of this DPA (Agency-tier and above), email{' '}
        <a href="mailto:hello@automatebro.com" className="underline">
          hello@automatebro.com
        </a>
        .
      </p>
    </article>
  );
}
