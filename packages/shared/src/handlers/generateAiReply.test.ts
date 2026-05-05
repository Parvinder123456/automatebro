/**
 * Spec 021 / Phase 3.2 — guard rails on the system prompt.
 *
 * We don't unit-test the AI quality (stochastic model output is the
 * wrong thing to assert in CI). What we DO assert: the system prompt
 * still contains the language-matching instruction. Catches accidental
 * regressions when someone refactors the prompt and drops the line.
 */
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT_BASE } from './generateAiReply.js';

describe('generateAiReply system prompt', () => {
  it('L1: includes the same-language instruction (spec 021)', () => {
    expect(SYSTEM_PROMPT_BASE).toMatch(/SAME language/i);
  });

  it('L2: enumerates English, Hindi (Devanagari), and Hinglish', () => {
    expect(SYSTEM_PROMPT_BASE).toMatch(/Hindi/);
    expect(SYSTEM_PROMPT_BASE).toMatch(/Devanagari/);
    expect(SYSTEM_PROMPT_BASE).toMatch(/Hinglish/);
    expect(SYSTEM_PROMPT_BASE).toMatch(/English/);
  });

  it('L3: keeps the existing brand-voice + concise + emoji guidance', () => {
    expect(SYSTEM_PROMPT_BASE).toMatch(/concise/i);
    expect(SYSTEM_PROMPT_BASE).toMatch(/brand voice/i);
    expect(SYSTEM_PROMPT_BASE).toMatch(/emoji/i);
  });

  it('L4: still forbids unverified price/deal promises', () => {
    expect(SYSTEM_PROMPT_BASE).toMatch(/(prices|deals|product availability)/i);
  });
});
