/**
 * Spec 012 — SEO comparison page: BloomDM vs LinkPlease.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BloomDM vs LinkPlease — Instagram DM Automation Comparison',
  description:
    'Compare BloomDM and LinkPlease for Instagram DM automation. AI replies, lead capture, and flat INR pricing.',
  openGraph: {
    title: 'BloomDM vs LinkPlease',
    description: 'See how BloomDM compares to LinkPlease for Instagram automation.',
  },
};

const ROWS = [
  { feature: 'Instagram DM Automation', us: 'Yes', them: 'Yes' },
  { feature: 'Comment-to-DM Triggers', us: 'Yes', them: 'Yes' },
  { feature: 'AI-Powered Replies', us: 'Built-in', them: 'No' },
  { feature: 'Lead Capture', us: 'Email + phone in DM', them: 'Limited' },
  { feature: 'Pricing', us: 'Free + Rs 999/mo + Rs 2,999/mo', them: 'USD pricing' },
  { feature: 'Multi-Account', us: 'Unlimited (Agency)', them: 'Limited' },
  { feature: 'Analytics Dashboard', us: 'Yes', them: 'Basic' },
  { feature: 'Data Residency (India)', us: 'Yes (Mumbai)', them: 'No' },
  { feature: 'CSV Export', us: 'Yes', them: 'Yes' },
  { feature: 'Story Reply Triggers', us: 'Yes', them: 'No' },
];

export default function CompareLinkPlease() {
  return (
    <main className="py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h1 className="text-4xl font-bold">BloomDM vs LinkPlease</h1>
        <p className="mt-3 text-lg text-gray-600">
          LinkPlease does keyword-triggered DMs well. BloomDM does that plus AI replies, lead
          capture, analytics, and INR billing — built from the ground up for Indian creators.
        </p>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 text-left font-semibold">Feature</th>
                <th className="py-3 px-4 text-left font-semibold">BloomDM</th>
                <th className="py-3 pl-4 text-left font-semibold">LinkPlease</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.feature} className="border-b">
                  <td className="py-3 pr-4">{r.feature}</td>
                  <td className="py-3 px-4 font-medium">{r.us}</td>
                  <td className="py-3 pl-4 text-gray-600">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 rounded-xl bg-gray-50 p-8 text-center">
          <h2 className="text-2xl font-bold">Ready to switch?</h2>
          <p className="mt-2 text-gray-600">
            Start free — no credit card, no contracts.
          </p>
          <a
            href="/signup"
            className="mt-4 inline-block rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
          >
            Start Free
          </a>
        </div>
      </div>
    </main>
  );
}
