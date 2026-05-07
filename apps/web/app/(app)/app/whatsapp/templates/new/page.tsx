/**
 * Spec 026 — create-template page.
 */
import { listWhatsappAccounts } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TemplateForm } from '../../../../../../components/whatsapp/template-form';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const metadata = { title: 'New WhatsApp template — BloomDM' };

export default async function NewWhatsappTemplatePage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }
  const accounts = await listWhatsappAccounts(ctx);

  return (
    <div className="p-8" data-testid="whatsapp-template-new-page">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link
          href="/app/whatsapp/templates"
          className="text-gray-600 underline-offset-2 hover:underline"
        >
          ← Templates
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">New template</h1>
      <TemplateForm accounts={accounts} />
    </div>
  );
}
