import { listAutomations } from '@automatebro/shared/handlers/automations/listAutomations';
import { listIgAccounts } from '@automatebro/shared/handlers/igAccounts/listIgAccounts';
import { redirect } from 'next/navigation';
import { Pager } from '../../../../components/app/pager';
import { RowActions } from '../../../../components/automations/row-actions';
import { StatusBadge } from '../../../../components/automations/status-badge';
import { getCtx } from '../../../../lib/auth/get-ctx';

export const metadata = { title: 'Automations — AutomateBro' };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}

function intParam(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback;
  return Math.max(1, Math.min(max, Number(raw)));
}

export default async function AutomationsPage({ searchParams }: PageProps) {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const sp = await searchParams;
  const page = intParam(sp.page, 1, 10_000);
  const pageSize = intParam(sp.pageSize, 25, 100);

  const [result, igAccounts] = await Promise.all([
    listAutomations(ctx, { page, pageSize }),
    listIgAccounts(ctx),
  ]);
  const items = result.items;
  const hasIgAccount = igAccounts.length > 0;

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Automations</h1>
        <a
          href="/app/automations/new"
          className="rounded bg-black px-4 py-2 text-sm text-white"
          data-testid="new-automation-link"
        >
          New automation
        </a>
      </div>

      {result.total === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center"
          data-testid="automations-empty"
        >
          {!hasIgAccount ? (
            <>
              <p className="mb-2 text-base font-medium">Connect Instagram first</p>
              <p className="mx-auto mb-4 max-w-md text-sm text-gray-600">
                Automations fire on events from your connected Instagram Business accounts. Connect
                at least one to create your first automation.
              </p>
              <a
                href="/app/integrations"
                className="inline-block rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
              >
                Connect Instagram →
              </a>
            </>
          ) : (
            <>
              <p className="mb-2 text-base font-medium">No automations yet</p>
              <p className="mx-auto mb-5 max-w-md text-sm text-gray-600">
                Pick a starting template or build from scratch. Tenants typically start with a
                comment-to-DM automation: when someone comments "LINK" on your post, you DM them the
                link.
              </p>
              <div
                className="mx-auto mb-5 grid max-w-2xl gap-3 sm:grid-cols-3 text-left"
                data-testid="automation-templates"
              >
                <ExampleCard title="Link drop" text="Trigger: comment 'LINK' → DM the link." />
                <ExampleCard
                  title="Lead magnet"
                  text="Trigger: comment 'GUIDE' → DM ebook + ask for email."
                />
                <ExampleCard
                  title="Support"
                  text="Trigger: DM 'help' → AI reply with brand voice."
                />
              </div>
              <a
                href="/app/automations/new"
                className="inline-block rounded bg-black px-4 py-2 text-sm text-white hover:opacity-90"
              >
                Create automation →
              </a>
            </>
          )}
        </div>
      ) : (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="pb-2">Name</th>
                <th className="pb-2">Trigger</th>
                <th className="pb-2">Keywords</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ automation, trigger }) => (
                <tr
                  key={automation._id}
                  className="border-b"
                  data-testid={`automation-row-${automation._id}`}
                >
                  <td className="py-2">{automation.name}</td>
                  <td className="py-2">{automation.trigger}</td>
                  <td className="py-2">{trigger?.keywords?.join(', ') ?? '—'}</td>
                  <td className="py-2">
                    <StatusBadge status={automation.status} />
                  </td>
                  <td className="py-2">
                    <RowActions automationId={automation._id} status={automation.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            hasNext={result.hasNext}
            basePath="/app/automations"
          />
        </>
      )}
    </div>
  );
}

function ExampleCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-gray-600">{text}</div>
    </div>
  );
}
