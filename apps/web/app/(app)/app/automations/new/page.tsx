import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { listWhatsappAccounts } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import { listWhatsappTemplates } from '@automatebro/shared/handlers/whatsappTemplates/listWhatsappTemplates';
import { redirect } from 'next/navigation';
import { AutomationForm } from '../../../../../components/automations/automation-form';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const metadata = { title: 'New Automation — BloomDM' };

export default async function NewAutomationPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  // Spec 026 — fetch WA accounts + approved templates in parallel with
  // IG accounts so the form can offer the WhatsApp trigger option.
  const [igAccounts, waAccounts, waTemplates] = await Promise.all([
    listIgAccounts(ctx),
    listWhatsappAccounts(ctx),
    listWhatsappTemplates(ctx),
  ]);

  const approvedTemplates = waTemplates
    .filter((t) => t.status === 'approved')
    .map((t) => ({
      _id: t._id,
      whatsappAccountId: t.whatsappAccountId,
      name: t.name,
      language: t.language,
      variableCount: t.variableCount,
    }));

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">New automation</h1>
      <AutomationForm
        igAccounts={igAccounts.map((a) => ({ _id: a._id, igUsername: a.igUsername }))}
        whatsappAccounts={waAccounts.map((a) => ({
          _id: a._id,
          displayPhoneNumber: a.displayPhoneNumber,
          verifiedName: a.verifiedName,
          disconnectedAt: a.disconnectedAt,
        }))}
        whatsappTemplates={approvedTemplates}
      />
    </div>
  );
}
