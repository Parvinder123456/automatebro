/**
 * Spec 022 / Phase 4.5 — preview ("test fire") an automation without
 * actually sending anything.
 *
 * Tenant types a sample message; we run the keyword match + template
 * render and return the result. NO outbound DM, no AI call, no DB write.
 * Pure dry-run.
 *
 * For AI-mode automations we return the fallback template as the
 * rendered content (since AI generates at runtime; previewing the AI
 * output would burn cap and the result is non-deterministic anyway).
 */
import type { Ctx } from '../../auth/ctx.js';
import { repo } from '../../db/repo.js';
import type { ResponseRecord, Trigger } from '../../types/tenant.js';

export interface PreviewAutomationInput {
  automationId: string;
  sampleText: string;
  sampleUsername?: string;
}

export interface PreviewAutomationResult {
  matched: boolean;
  /** Why the match decision was made — useful for tenant debugging. */
  matchReason: string;
  mode: 'static' | 'ai';
  /**
   * The DM that would be sent. For static mode this is the rendered
   * template. For AI mode this is the fallback template (AI is
   * runtime-generated; previewing it costs money + non-deterministic).
   */
  renderedContent: string | null;
  /** Optional comment-reply that would also fire (if configured). */
  renderedCommentReply: string | null;
}

function matchesKeyword(text: string, keyword: string, mode: Trigger['matchMode']): boolean {
  const t = text.toLowerCase();
  const k = keyword.toLowerCase();
  switch (mode) {
    case 'exact':
      return t.trim() === k;
    case 'startsWith':
      return t.startsWith(k);
    default:
      return t.includes(k);
  }
}

function renderTemplate(template: string, vars: { firstName: string; username: string }): string {
  return template.replaceAll('{firstName}', vars.firstName).replaceAll('{username}', vars.username);
}

export async function previewAutomation(
  ctx: Ctx,
  input: PreviewAutomationInput,
): Promise<PreviewAutomationResult> {
  const trigger = await repo.queryOne<Trigger>(
    'triggers',
    { automationId: input.automationId },
    ctx,
  );
  if (trigger === null) {
    return {
      matched: false,
      matchReason: 'Trigger row not found for this automation.',
      mode: 'static',
      renderedContent: null,
      renderedCommentReply: null,
    };
  }

  const response = await repo.queryOne<ResponseRecord>(
    'responses',
    { automationId: input.automationId },
    ctx,
  );
  if (response === null) {
    return {
      matched: false,
      matchReason: 'Response row not found for this automation.',
      mode: 'static',
      renderedContent: null,
      renderedCommentReply: null,
    };
  }

  // Keyword match
  const matchedKeyword = trigger.keywords.find((kw) =>
    matchesKeyword(input.sampleText, kw, trigger.matchMode),
  );
  const matched = matchedKeyword !== undefined;
  const matchReason = matched
    ? `Matched keyword "${matchedKeyword}" in ${trigger.matchMode} mode.`
    : `No keyword matched. Tried: ${trigger.keywords.join(', ')} (${trigger.matchMode} mode).`;

  if (!matched) {
    return {
      matched: false,
      matchReason,
      mode: response.mode,
      renderedContent: null,
      renderedCommentReply: null,
    };
  }

  const username = input.sampleUsername ?? 'sample_user';
  const vars = { firstName: username, username };

  // Render the DM content. For AI mode, show the fallback template
  // (the actual AI reply happens at runtime + costs money; not worth
  // burning cap for a preview).
  let renderedContent: string | null = null;
  if (response.mode === 'static') {
    const template = response.template ?? '';
    renderedContent = template !== '' ? renderTemplate(template, vars) : null;
  } else {
    // AI mode: the runtime reply is non-deterministic. Show the
    // fallback template + a hint so the tenant knows the preview
    // doesn't reflect what gpt-4o-mini would say.
    const fallback = response.fallbackTemplate ?? response.template ?? '';
    renderedContent = fallback !== '' ? renderTemplate(fallback, vars) : null;
  }

  // Optional comment-reply (only fires for trigger='comment'; we
  // render it regardless and let the UI decide whether to display).
  const renderedCommentReply =
    response.commentReply !== null &&
    response.commentReply !== undefined &&
    response.commentReply !== ''
      ? renderTemplate(response.commentReply, vars)
      : null;

  return {
    matched: true,
    matchReason,
    mode: response.mode,
    renderedContent,
    renderedCommentReply,
  };
}
