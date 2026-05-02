import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { redirect } from 'next/navigation';
import { DisconnectButton } from '../../../../components/integrations/disconnect-button';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Integrations — AutomateBro' };

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string; message?: string }>;
}

/**
 * Spec 004 — connected Instagram accounts. Server Component reads the
 * tenant's accounts and renders the list. The Connect button links to
 * /api/v1/auth/meta/start which initiates OAuth.
 */
export default async function IntegrationsPage({ searchParams }: PageProps) {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const accounts = await listIgAccounts(ctx);
  const params = await searchParams;
  const connectedCount = params.connected ? Number.parseInt(params.connected, 10) : null;
  const errorCode = params.error ?? null;

  return (
    <main className="mx-auto max-w-3xl p-8" data-testid="integrations-page">
      <h1 className="mb-2 text-3xl font-semibold">Integrations</h1>
      <p className="mb-6 text-sm text-gray-600">
        Connect your Instagram Business account so AutomateBro can send DMs and reply to comments on
        your behalf.
      </p>

      {connectedCount !== null && connectedCount > 0 && (
        <div
          className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800"
          data-testid="connect-success"
        >
          Connected {connectedCount} Instagram account{connectedCount > 1 ? 's' : ''}.
        </div>
      )}
      {errorCode !== null && (
        <div
          className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          data-testid="connect-error"
        >
          Could not connect: {errorCode}
          {params.message ? ` — ${params.message}` : ''}
        </div>
      )}

      <div className="mb-6">
        <a
          href="/api/v1/auth/meta/start"
          className="inline-block rounded bg-black px-5 py-2 text-white"
          data-testid="connect-instagram"
        >
          Connect Instagram
        </a>
      </div>

      <h2 className="mb-3 text-xl font-semibold">Connected accounts</h2>
      {accounts.length === 0 ? (
        <p className="text-gray-600" data-testid="empty-state">
          No accounts connected yet. Click <strong>Connect Instagram</strong> above to get started.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="account-list">
          {accounts.map((acct) => (
            <li
              key={acct._id}
              className="flex items-center justify-between rounded border p-3"
              data-testid={`account-${acct.igUsername}`}
            >
              <div>
                <div className="font-medium">@{acct.igUsername}</div>
                <div className="text-xs text-gray-500">
                  Page: {acct.pageName ?? 'unknown'} · Connected{' '}
                  {new Date(acct.connectedAt).toLocaleDateString()}
                  {acct.webhookSubscribedAt
                    ? ' · Webhook active'
                    : ' · Webhook not subscribed (re-connect to retry)'}
                </div>
              </div>
              <DisconnectButton accountId={acct._id} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-gray-500">
        Tip: only Instagram <strong>Business</strong> or <strong>Creator</strong> accounts can be
        connected. Personal accounts are not supported by Meta&apos;s API.
      </p>
    </main>
  );
}
