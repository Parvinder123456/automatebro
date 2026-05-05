/**
 * Spec 019 / Phase 2.2 — getAiUsageSummary unit tests for the
 * formatters. The full integration path (DB seeding + handler call)
 * lives in tests/integration/aiUsageSummary.test.ts (gated on infra).
 */
import { describe, expect, it } from 'vitest';
import { formatPaise, formatTokens } from './getAiUsageSummary.js';

describe('formatPaise', () => {
  it('F1: 0 paise → ₹0.00', () => {
    expect(formatPaise(0)).toBe('₹0.00');
  });

  it('F2: 100 paise → ₹1.00', () => {
    expect(formatPaise(100)).toBe('₹1.00');
  });

  it('F3: 12_345 paise → ₹123.45 (Indian grouping)', () => {
    expect(formatPaise(12_345)).toBe('₹123.45');
  });

  it('F4: 1_00_00_000 paise (₹1 lakh) groups as 1,00,000.00', () => {
    expect(formatPaise(1_00_00_000)).toBe('₹1,00,000.00');
  });

  it('F5: large numbers use Indian grouping not en-US', () => {
    // ₹12,34,567.89 — 1,234,567.89 USD-style would be wrong
    expect(formatPaise(12_34_56_789)).toBe('₹12,34,567.89');
  });
});

describe('formatTokens', () => {
  it('T1: 0 → "0"', () => {
    expect(formatTokens(0)).toBe('0');
  });

  it('T2: 1234 → "1,234"', () => {
    expect(formatTokens(1234)).toBe('1,234');
  });

  it('T3: 100000 → "1,00,000" (Indian grouping)', () => {
    expect(formatTokens(100_000)).toBe('1,00,000');
  });

  it('T4: 12_34_56_789 → "12,34,56,789"', () => {
    expect(formatTokens(12_34_56_789)).toBe('12,34,56,789');
  });
});
