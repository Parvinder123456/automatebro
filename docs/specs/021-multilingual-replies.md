# Spec 021 — Multilingual AI replies (Hindi + English + Hinglish)

> **MDD phase:** Compressed (Phase 3 autonomy mode).
> **Implements:** Phase 3.2 of `docs/TODO_BUILD.md` — auto-detect inbound
> language and reply in the same language. Hindi + English are the
> v1 target locales (covers 95%+ of the Indian creator market).

**Status:** In flight
**Branch:** `feat/phase3-2-multilingual`

---

## 1. Goal

When `responses.mode === 'ai'`, the generated reply matches the
language of the inbound comment / DM:
- English comment → English reply
- Hindi (Devanagari) comment → Hindi reply
- Hinglish ("send mujhe LINK please") → Hinglish reply
- Other languages (Tamil, Bengali, Marathi, Gujarati, …) → use English
  as fallback for v1; expand later if data justifies it.

Static templates are unchanged — they're tenant-authored and assumed
to match the tenant's audience already.

---

## 2. Out of scope

- **Tenant-configurable language preference.** v1 auto-detects only.
  Phase 4 may add `responses.replyLanguage` for tenants who want to
  force a specific language.
- **Detection-confidence scoring** — gpt-4o-mini handles language
  matching reliably enough that we don't need a separate detection
  pass.
- **Right-to-left languages** (Urdu, Arabic) — out of scope; the IG
  audience for our target market doesn't need them.
- **Translation between languages** — we mirror the inbound language,
  we don't translate.
- **Language-aware moderation** — OpenAI moderation is multilingual by
  default; no change needed.

---

## 3. Architectural decisions

### 3.1 Prompt engineering only — no schema, no migration, no UI

The change is one line added to the system prompt:

> "Detect the language of the user's last message (English, Hindi in
> Devanagari script, Hinglish, or other). Reply in the **same**
> language and script. If the language is none of these or you're
> unsure, reply in English."

This is the cheapest possible change. gpt-4o-mini's multilingual
performance for Hindi + Hinglish is well-documented; we don't need
fine-tuning or a separate model.

### 3.2 No new env vars, no new dependencies

`OPENAI_API_KEY` is already required for AI replies. Multilingual
support is a free add-on at the prompt layer.

### 3.3 Cost impact: negligible

Hindi tokens are typically 2–3x English tokens per character (Devanagari
is multi-byte UTF-8). A 100-char Hindi reply is ~80 tokens vs ~25 for
English. At ~₹0.0002 per AI call, this rounds to noise.

The per-tenant cap (Phase 1.2 / spec 016) already enforces an upper
bound; tenants on Free plan get auto-fallback to template if Hindi
replies push them over the ₹100/mo cap.

### 3.4 Fallback template stays English

The tenant authored the fallback template in their preferred language;
if AI fails / is moderated / is rate-limited, we send the fallback
verbatim. We don't try to translate the fallback.

### 3.5 No automatic test coverage for language quality

Language quality is non-deterministic (gpt-4o-mini sampling). We
**don't** assert "Hindi input produces Hindi output" in CI — that's a
flaky test against a stochastic model. Quality regressions are caught
manually via the existing AI reply E2E (spec 008) and operator review.

What we DO test: the system prompt contains the language-matching
instruction (snapshot test).

---

## 4. Files to modify

- `packages/shared/src/handlers/generateAiReply.ts` — add the
  language-matching line to `SYSTEM_PROMPT_BASE`.
- `packages/shared/src/handlers/generateAiReply.test.ts` — new test
  asserting the system prompt includes the language instruction.
- ~~`apps/web/components/automations/automation-form.tsx` — add a
  one-line hint to the AI prompt textarea.~~ DROPPED: the form
  currently only exposes static-mode response (spec 011 scope). When
  AI-mode is added to the form (separate future task), the hint lands
  alongside the new aiPrompt textarea. Tenants who use AI-mode today
  do so via direct API calls and have read this spec.

---

## 5. Tests

- **L1: SYSTEM_PROMPT_BASE includes language instruction** — string
  match for "same language".
- Existing tests for AI reply pipeline keep passing.

No integration tests — see §3.5.

---

## 6. Acceptance criteria

- [ ] System prompt updated with the language-matching instruction.
- [ ] Snapshot unit test asserts the instruction is present.
- [ ] AutomationForm copy mentions auto-language behavior (one-line
      hint).
- [ ] `pnpm smoke` green.

---

## 7. Risks

1. **gpt-4o-mini misclassifies Hinglish as English** and replies in
   pure English. Mitigation: prompt explicitly enumerates Hinglish as
   a distinct language. If we see this in practice, we add a few-shot
   example.
2. **Cost spike from longer Devanagari tokens.** Mitigation: existing
   per-tenant cap enforces the ceiling; tenants who exceed see fallback
   template (existing behavior).
3. **Brand-voice tone-hint conflict** — e.g. "playful" tone in Hindi
   may need different idioms than English. Acceptable for v1; tenant
   can edit `aiPrompt` to add language-specific tone hints.
