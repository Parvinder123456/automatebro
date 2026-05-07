/**
 * Spec 026 — WhatsApp connect page (manual token paste).
 */
import { redirect } from 'next/navigation';
import { ConnectForm } from '../../../../../components/whatsapp/connect-form';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const metadata = { title: 'Connect WhatsApp — BloomDM' };

export default async function WhatsappConnectPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  return (
    <div className="p-8" data-testid="whatsapp-connect-page">
      <h1 className="mb-2 text-2xl font-semibold">Connect WhatsApp</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-700">
        Paste your WhatsApp Business credentials below. We verify the token with Meta before saving
        anything, and encrypt at rest with AES-256.
      </p>

      <div className="max-w-2xl rounded-lg border bg-white p-6 shadow-sm">
        <ConnectForm />
      </div>

      <details className="mt-6 max-w-2xl text-sm text-gray-700">
        <summary className="cursor-pointer font-medium text-gray-900">
          Where do I find these IDs?
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            Go to{' '}
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              business.facebook.com
            </a>{' '}
            → WhatsApp Accounts → select your WABA. The ID is in the URL + settings panel.
          </li>
          <li>
            Phone Number ID lives in{' '}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              your Meta App
            </a>{' '}
            → WhatsApp → API Setup → "From" dropdown.
          </li>
          <li>
            Generate a System User Access Token from Business Settings → System Users → Generate New
            Token. Pick the WhatsApp app and tick{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              whatsapp_business_messaging
            </code>{' '}
            +{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
              whatsapp_business_management
            </code>
            . Choose "Never expires" if available.
          </li>
        </ol>
      </details>
    </div>
  );
}
