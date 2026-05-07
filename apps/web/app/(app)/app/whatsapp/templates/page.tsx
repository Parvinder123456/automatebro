/**
 * Spec 026 — templates list page.
 */
import { listWhatsappTemplates } from '@automatebro/shared/handlers/whatsappTemplates/listWhatsappTemplates';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TemplateStatusBadge } from '../../../../../components/whatsapp/template-status-badge';
import { getCtx } from '../../../../../lib/auth/get-ctx';

export const metadata = { title: 'WhatsApp templates — BloomDM' };

export default async function WhatsappTemplatesPage() {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }

  const templates = await listWhatsappTemplates(ctx);

  return (
    <div className="p-8" data-testid="whatsapp-templates-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">WhatsApp templates</h1>
        <Link
          href="/app/whatsapp/templates/new"
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
          data-testid="new-template-cta"
        >
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-gray-50 p-8 text-center">
          <p className="font-medium">No templates yet.</p>
          <p className="mt-1 text-sm text-gray-700">
            Templates let you send messages outside the 24-hour service window. Meta typically
            reviews within 24-48 hours.
          </p>
          <Link
            href="/app/whatsapp/templates/new"
            className="mt-4 inline-block rounded bg-black px-4 py-2 text-sm text-white"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t._id}
                  className="border-b last:border-0 hover:bg-gray-50"
                  data-testid="template-row"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/app/whatsapp/templates/${t._id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{t.category}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.language}</td>
                  <td className="px-4 py-3">
                    <TemplateStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {t.updatedAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
