/**
 * Spec 012 — SEO comparison page: BloomDM vs ManyChat.
 */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BloomDM vs ManyChat — Instagram DM Automation Comparison',
  description:
    'Compare BloomDM and ManyChat for Instagram DM automation. Flat INR pricing, native AI replies, and built for Indian creators.',
  openGraph: {
    title: 'BloomDM vs ManyChat',
    description: 'See how BloomDM compares to ManyChat for Instagram automation.',
  },
};

const ROWS = [
  { feature: 'Instagram DM Automation', us: 'Yes', them: 'Yes' },
  { feature: 'Comment-to-DM Triggers', us: 'Yes', them: 'Yes' },
  { feature: 'AI-Powered Replies', us: 'Built-in (day 1)', them: 'Add-on' },
  { feature: 'Pricing Currency', us: 'INR (flat-rate)', them: 'USD only' },
  { feature: 'Free Plan', us: 'Yes (1 account, 3 automations)', them: 'Limited' },
  { feature: 'Lead Capture in DM', us: 'Yes', them: 'Yes (Pro)' },
  { feature: 'Multi-Account Support', us: 'True unlimited (Agency)', them: 'Per-seat pricing' },
  { feature: 'Setup Complexity', us: 'Connect + go (5 min)', them: 'Flow builder (learning curve)' },
  { feature: 'Target Market', us: 'Indian creators & D2C', them: 'Global (US-centric)' },
  { feature: 'Data Residency (India)', us: 'Yes (Mumbai)', them: 'No' },
];

export default function CompareManyChat() {
  return (
    <main className="py-20">
      <div className="mx-auto max-w-4xl px-6">
        <h1 className="text-4xl font-bold">BloomDM vs ManyChat</h1>
        <p className="mt-3 text-lg text-gray-600">
          ManyChat is a great tool for global markets. But if you&apos;re an Indian creator or D2C
          brand, BloomDM is built specifically for you — with INR pricing, AI replies from day
          one, and data stored in India.
        </p>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 pr-4 text-left font-semibold">Feature</th>
                <th className="py-3 px-4 text-left font-semibold">BloomDM</th>
                <th className="py-3 pl-4 text-left font-semibold">ManyChat</th>
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
            Start free — no credit card, no contracts, no USD surprises.
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
