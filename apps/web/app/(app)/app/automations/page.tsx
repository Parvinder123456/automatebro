import { listAutomations } from '@automatebro/shared/handlers/automations/listAutomations';
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

  const result = await listAutomations(ctx, { page, pageSize });
  const items = result.items;

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
        <p className="text-gray-500">No automations yet. Create one to get started.</p>
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
