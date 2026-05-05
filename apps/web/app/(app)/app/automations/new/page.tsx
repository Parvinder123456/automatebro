import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { redirect } from 'next/navigation';
import { AutomationForm } from '../../../../../components/automations/automation-form';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const metadata = { title: 'New Automation — AutomateBro' };

export default async function NewAutomationPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const accounts = await listIgAccounts(ctx);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">New automation</h1>
      <AutomationForm
        igAccounts={accounts.map((a) => ({ _id: a._id, igUsername: a.igUsername }))}
      />
    </div>
  );
}
