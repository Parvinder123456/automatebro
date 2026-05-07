/**
 * Spec 026 — visual status chip for WhatsApp templates.
 */
import type { WhatsappTemplate } from '@automatebro/shared/types/tenant';

const STYLES: Record<WhatsappTemplate['status'], string> = {
  draft: 'bg-gray-100 text-gray-800 border-gray-300',
  pending: 'bg-amber-100 text-amber-900 border-amber-300',
  approved: 'bg-green-100 text-green-900 border-green-300',
  rejected: 'bg-red-100 text-red-900 border-red-300',
  paused: 'bg-orange-100 text-orange-900 border-orange-300',
  disabled: 'bg-gray-200 text-gray-700 border-gray-400',
};

const LABELS: Record<WhatsappTemplate['status'], string> = {
  draft: 'Draft',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  paused: 'Paused by Meta',
  disabled: 'Disabled',
};

export function TemplateStatusBadge({ status }: { status: WhatsappTemplate['status'] }) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
      data-testid={`template-status-${status}`}
    >
      {LABELS[status]}
    </span>
  );
}
