/**
 * Spec 025 / Phase 4.7 — first-run onboarding checklist.
 *
 * Server Component. Takes the same data the dashboard already
 * fetched (no new I/O), derives "completed" status per step, renders
 * a 4-step guided list. Auto-hides when every step is done.
 */
import type { ReactNode } from 'react';

interface ChecklistStep {
  n: number;
  title: string;
  body: ReactNode;
  href: string;
  cta: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  igAccountCount: number;
  automationCount: number;
  sendCount: number;
  leadCount: number;
}

export function OnboardingChecklist({
  igAccountCount,
  automationCount,
  sendCount,
  leadCount,
}: OnboardingChecklistProps) {
  const steps: ChecklistStep[] = [
    {
      n: 1,
      title: 'Connect Instagram',
      body: 'Two clicks via Facebook Login for Business. We never see your password.',
      href: '/app/integrations',
      cta: 'Connect →',
      completed: igAccountCount > 0,
    },
    {
      n: 2,
      title: 'Create your first automation',
      body: 'Pick a keyword like LINK and a reply template. Tenants typically start with comment-to-DM.',
      href: '/app/automations/new',
      cta: 'Create →',
      completed: automationCount > 0,
    },
    {
      n: 3,
      title: 'Test-fire to verify it works',
      body: 'Use the "Test fire" button on any automation row to dry-run against a sample message — no real DM sent.',
      href: '/app/automations',
      cta: 'Open automations →',
      // Squishy: we proxy "tested" with "automation exists AND we've
      // logged at least one send". Spec 025 §3.1 accepts the proxy.
      completed: automationCount > 0 && sendCount > 0,
    },
    {
      n: 4,
      title: 'Watch leads roll in',
      body: 'When end-users reply to your DMs with email or phone, we capture them on the leads page. CSV-export anytime.',
      href: '/app/leads',
      cta: 'Open leads →',
      completed: leadCount > 0,
    },
  ];

  // Auto-hide once everything is done.
  if (steps.every((s) => s.completed)) return null;

  const nextIncomplete = steps.findIndex((s) => !s.completed);

  return (
    <section
      className="mb-6 rounded-lg border border-blue-200 bg-blue-50/40 p-5"
      data-testid="onboarding-checklist"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Get started in 4 steps</h2>
        <span className="text-xs text-gray-600" data-testid="onboarding-progress">
          {steps.filter((s) => s.completed).length} / {steps.length} done
        </span>
      </header>

      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li
            key={step.n}
            className={`flex items-start gap-3 rounded border p-3 ${
              step.completed
                ? 'border-green-200 bg-green-50/50'
                : idx === nextIncomplete
                  ? 'border-blue-300 bg-white'
                  : 'border-gray-200 bg-white'
            }`}
            data-testid={`onboarding-step-${step.n}`}
            data-completed={step.completed ? 'true' : 'false'}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.completed ? 'bg-green-600 text-white' : 'bg-black text-white'
              }`}
              aria-hidden="true"
            >
              {step.completed ? '✓' : step.n}
            </span>
            <div className="flex-1">
              <h3
                className={`font-semibold text-sm ${
                  step.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                }`}
              >
                {step.title}
              </h3>
              {!step.completed && <p className="mt-1 text-xs text-gray-600">{step.body}</p>}
            </div>
            {!step.completed && (
              <a
                href={step.href}
                className={`shrink-0 rounded px-3 py-1 text-xs ${
                  idx === nextIncomplete
                    ? 'bg-black text-white hover:opacity-90'
                    : 'border text-gray-700 hover:bg-gray-50'
                }`}
                data-testid={`onboarding-cta-${step.n}`}
              >
                {step.cta}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
