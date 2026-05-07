/**
 * Spec 026 — WhatsApp hub page. Three states (per spec 026 §8.2):
 *   A. Not connected → CTA + pre-flight checklist
 *   B. Connected, no activity → empty-state cards
 *   C. Connected, active → status + cost + recent
 *
 * Server Component.
 */
import { listWhatsappAccounts } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import { listWhatsappTemplates } from '@automatebro/shared/handlers/whatsappTemplates/listWhatsappTemplates';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccountStatusCard } from '../../../../components/whatsapp/account-status-card';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'WhatsApp — BloomDM' };

export default async function WhatsappHubPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const [accounts, templates] = await Promise.all([
    listWhatsappAccounts(ctx),
    listWhatsappTemplates(ctx),
  ]);

  const activeAccount = accounts.find((a) => a.disconnectedAt === null) ?? null;

  // ---- State A: not connected ----
  if (activeAccount === null) {
    return (
      <div className="p-8" data-testid="whatsapp-hub-page">
        <h1 className="mb-2 text-2xl font-semibold">WhatsApp</h1>
        <p className="mb-8 max-w-2xl text-gray-700">
          Connect your WhatsApp Business number to receive customer messages, send automated replies
          inside the 24-hour service window, and ship template messages for outbound flows.
        </p>

        <div
          className="max-w-2xl rounded-lg border bg-white p-6 shadow-sm"
          data-testid="whatsapp-not-connected"
        >
          <h2 className="text-lg font-semibold">Connect WhatsApp Business</h2>
          <p className="mt-1 text-sm text-gray-600">
            Manual setup — paste IDs and a system-user access token from your Meta Business account.
          </p>

          <div className="mt-4 rounded bg-gray-50 p-4 text-sm">
            <div className="font-medium">Before you start</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
              <li>A verified Meta Business account</li>
              <li>WhatsApp product added to your Meta app</li>
              <li>A phone number provisioned in WhatsApp Business Manager</li>
              <li>A System User access token (we encrypt at rest)</li>
            </ul>
          </div>

          <Link
            href="/app/whatsapp/connect"
            data-testid="whatsapp-connect-cta"
            className="mt-6 inline-block rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Connect WhatsApp
          </Link>
        </div>
      </div>
    );
  }

  // ---- State B/C: connected ----
  const approvedTemplateCount = templates.filter((t) => t.status === 'approved').length;
  const pendingTemplateCount = templates.filter((t) => t.status === 'pending').length;

  return (
    <div className="p-8" data-testid="whatsapp-hub-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <div className="flex gap-2">
          <Link
            href="/app/whatsapp/templates"
            className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
            data-testid="whatsapp-view-templates"
          >
            Templates ({templates.length})
          </Link>
          <Link
            href="/app/whatsapp/templates/new"
            className="rounded bg-black px-3 py-1.5 text-sm text-white"
            data-testid="whatsapp-new-template"
          >
            New template
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <AccountStatusCard account={activeAccount} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SummaryTile label="Templates approved" value={approvedTemplateCount} />
          <SummaryTile label="Templates pending" value={pendingTemplateCount} />
          <SummaryTile label="Daily cap" value={`${activeAccount.dailyConversationCap}`} />
        </div>

        {templates.length === 0 && (
          <div
            className="rounded-lg border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-700"
            data-testid="whatsapp-templates-empty"
          >
            <p className="font-medium">No templates yet.</p>
            <p className="mt-1">
              Create a template to send messages outside the 24-hour service window.
            </p>
            <Link
              href="/app/whatsapp/templates/new"
              className="mt-3 inline-block rounded bg-black px-3 py-1.5 text-sm text-white"
            >
              Create your first template
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
