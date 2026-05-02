/**
 * Spec 002 §10.1 — public-paths unit tests (U3–U7).
 */
import { describe, expect, it } from 'vitest';
import { isPublicPath, shouldSkipSession } from './public-paths.js';

describe('apps/web/lib/auth/public-paths.ts', () => {
  it('U3: isPublicPath("/") returns true', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  it('U4: isPublicPath("/login") returns true', () => {
    expect(isPublicPath('/login')).toBe(true);
  });

  it('U4b: signup, forgot-password, reset-password, verify are public', () => {
    expect(isPublicPath('/signup')).toBe(true);
    expect(isPublicPath('/forgot-password')).toBe(true);
    expect(isPublicPath('/reset-password')).toBe(true);
    expect(isPublicPath('/verify')).toBe(true);
  });

  it('U5: webhook prefix is public', () => {
    expect(isPublicPath('/api/v1/webhooks/meta')).toBe(true);
    expect(isPublicPath('/api/v1/webhooks/razorpay')).toBe(true);
  });

  it('U5b: health endpoint and auth callback are public', () => {
    expect(isPublicPath('/api/v1/health')).toBe(true);
    expect(isPublicPath('/api/v1/auth/callback')).toBe(true);
    // Middleware passes only the pathname (no query string) to
    // isPublicPath, so the matcher does prefix-only and `?code=…` is
    // never seen here in practice.
  });

  it('U6: /app/* routes are NOT public', () => {
    expect(isPublicPath('/app')).toBe(false);
    expect(isPublicPath('/app/dashboard')).toBe(false);
    expect(isPublicPath('/app/automations')).toBe(false);
    expect(isPublicPath('/onboarding')).toBe(false);
  });

  it('U7: protected /api/v1/* routes are NOT public', () => {
    expect(isPublicPath('/api/v1/automations')).toBe(false);
    expect(isPublicPath('/api/v1/igAccounts')).toBe(false);
    expect(isPublicPath('/api/v1/leads')).toBe(false);
  });

  it('U7b: /compare/* SEO pages ARE public', () => {
    expect(isPublicPath('/compare/manychat')).toBe(true);
    expect(isPublicPath('/compare/linkplease')).toBe(true);
  });

  it('shouldSkipSession: webhooks + health skip cookie work', () => {
    expect(shouldSkipSession('/api/v1/webhooks/meta')).toBe(true);
    expect(shouldSkipSession('/api/v1/health')).toBe(true);
    expect(shouldSkipSession('/api/v1/auth/callback')).toBe(false);
    expect(shouldSkipSession('/login')).toBe(false);
    expect(shouldSkipSession('/app/dashboard')).toBe(false);
  });
});
