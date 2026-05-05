/**
 * Spec 002 §10.1 — public-paths unit tests (U3–U7).
 */
import { describe, expect, it } from 'vitest';
import { isPublicPath, safeRedirectPath, shouldSkipSession } from './public-paths.js';

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

  it('U7c: marketing legal pages are public (spec 012/013)', () => {
    expect(isPublicPath('/pricing')).toBe(true);
    expect(isPublicPath('/privacy')).toBe(true);
    expect(isPublicPath('/terms')).toBe(true);
    expect(isPublicPath('/dpa')).toBe(true);
    expect(isPublicPath('/deleted')).toBe(true);
  });

  it('U7d: settings page is NOT public', () => {
    expect(isPublicPath('/app/settings')).toBe(false);
  });

  it('shouldSkipSession: webhooks + health skip cookie work', () => {
    expect(shouldSkipSession('/api/v1/webhooks/meta')).toBe(true);
    expect(shouldSkipSession('/api/v1/health')).toBe(true);
    expect(shouldSkipSession('/api/v1/auth/callback')).toBe(false);
    expect(shouldSkipSession('/login')).toBe(false);
    expect(shouldSkipSession('/app/dashboard')).toBe(false);
  });

  describe('safeRedirectPath — open-redirect protection', () => {
    it('accepts same-origin relative paths', () => {
      expect(safeRedirectPath('/app')).toBe('/app');
      expect(safeRedirectPath('/onboarding')).toBe('/onboarding');
      expect(safeRedirectPath('/')).toBe('/');
      expect(safeRedirectPath('/app/automations')).toBe('/app/automations');
    });

    it('rejects absolute external URLs', () => {
      expect(safeRedirectPath('https://evil.com')).toBe('/app');
      expect(safeRedirectPath('http://evil.com/path')).toBe('/app');
    });

    it('rejects protocol-relative URLs', () => {
      expect(safeRedirectPath('//evil.com')).toBe('/app');
      expect(safeRedirectPath('//evil.com/path')).toBe('/app');
    });

    it('rejects backslash-prefixed paths (Windows-style hijack)', () => {
      expect(safeRedirectPath('/\\evil.com')).toBe('/app');
    });

    it('rejects null / undefined / empty', () => {
      expect(safeRedirectPath(null)).toBe('/app');
      expect(safeRedirectPath(undefined)).toBe('/app');
      expect(safeRedirectPath('')).toBe('/app');
    });

    it('honours custom fallback', () => {
      expect(safeRedirectPath('https://evil.com', '/login')).toBe('/login');
      expect(safeRedirectPath(null, '/login')).toBe('/login');
    });

    it('rejects javascript: and data: schemes', () => {
      // These don't start with /, so they fall through to fallback.
      expect(safeRedirectPath('javascript:alert(1)')).toBe('/app');
      expect(safeRedirectPath('data:text/html,<script>')).toBe('/app');
    });
  });
});
