/**
 * Spec 026 — template detail page. Shows preview + status + actions.
 */
import { getDb } from '@automatebro/shared/db/client';
import { repo } from '@automatebro/shared/db/repo';
import type { WhatsappTemplate } from '@automatebro/shared/types/tenant';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { TemplateStatusBadge } from '../../../../../../components/whatsapp/template-status-badge';
import { getCtx } from '../../../../../../lib/auth/get-ctx';

export const metadata = { title: 'Template — BloomDM' };

export default async function WhatsappTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getCtx();
  if (ctx === null || ctx.tenantId === null) {
    redirect('/onboarding');
  }
  const { id } = await params;
  // Need raw db access since handler doesn't return single-row by id
  // (we'd need to add one; for now repo.queryOne with tenant scoping).
  await getDb();
  const template = await repo.queryOne<WhatsappTemplate>('whatsappTemplates', { _id: id }, ctx);
  if (template === null) notFound();

  return (
    <div className="p-8" data-testid="whatsapp-template-detail-page">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link
          href="/app/whatsapp/templates"
          className="text-gray-600 underline-offset-2 hover:underline"
        >
          ← Templates
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{template.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <TemplateStatusBadge status={template.status} />
            <span className="text-sm capitalize text-gray-600">
              {template.category} · {template.language}
            </span>
          </div>
        </div>
      </div>

      {template.status === 'pending' && (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Submitted to Meta.</strong> Templates are typically reviewed within 24-48 hours.
          You'll see status update here automatically.
        </div>
      )}
      {template.status === 'rejected' &&
        template.rejectionReason !== null &&
        template.rejectionReason !== undefined && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <strong>Rejected by Meta.</strong> Reason: {template.rejectionReason}
          </div>
        )}
      {template.status === 'paused' && (
        <div className="mb-6 rounded border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <strong>Paused by Meta.</strong> Quality issues — see Meta Business Manager for details.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <div className="text-xs uppercase tracking-wider text-gray-500">Preview</div>
          <div
            className="mt-2 max-w-sm rounded-lg bg-[#dcf8c6] p-4 shadow-sm"
            data-testid="template-detail-preview"
          >
            <div className="whitespace-pre-wrap text-sm text-gray-900">
              {template.bodyText.replaceAll(/\{\{(\d+)\}\}/g, '⟨$1⟩')}
            </div>
            {template.footerText !== null &&
              template.footerText !== undefined &&
              template.footerText.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">{template.footerText}</div>
              )}
          </div>
        </section>

        <section>
          <div className="text-xs uppercase tracking-wider text-gray-500">Details</div>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Variables</dt>
              <dd>{template.variableCount}</dd>
            </div>
            {template.metaTemplateId !== null && template.metaTemplateId !== undefined && (
              <div>
                <dt className="text-gray-500">Meta template ID</dt>
                <dd className="font-mono text-xs">{template.metaTemplateId}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Created</dt>
              <dd>{template.createdAt.toLocaleString()}</dd>
            </div>
            {template.submittedAt !== null && template.submittedAt !== undefined && (
              <div>
                <dt className="text-gray-500">Submitted</dt>
                <dd>{template.submittedAt.toLocaleString()}</dd>
              </div>
            )}
            {template.approvedAt !== null && template.approvedAt !== undefined && (
              <div>
                <dt className="text-gray-500">Approved</dt>
                <dd>{template.approvedAt.toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </div>
  );
}
