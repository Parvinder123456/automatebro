/**
 * Spec 003 §10.2 — schema unit tests.
 */
import { describe, expect, it } from 'vitest';
import { TenantSchema, TenantUserSchema, slugify } from './schema.js';

const VALID_TENANT = {
  _id: '11111111-1111-4111-8111-111111111111',
  name: 'Studio',
  slug: 'studio-a3f9c2',
  plan: 'free' as const,
  createdAt: new Date(),
};

describe('TenantSchema', () => {
  it('S1: rejects when slug is missing', () => {
    const { slug: _omit, ...rest } = VALID_TENANT;
    expect(() => TenantSchema.parse(rest)).toThrow();
  });

  it('S2: rejects uppercase or invalid slug', () => {
    expect(() => TenantSchema.parse({ ...VALID_TENANT, slug: 'UPPERCASE' })).toThrow();
    expect(() => TenantSchema.parse({ ...VALID_TENANT, slug: 'has spaces' })).toThrow();
    expect(() => TenantSchema.parse({ ...VALID_TENANT, slug: 'ab' })).toThrow(); // too short
  });

  it('S2b: accepts valid slugs', () => {
    expect(() => TenantSchema.parse({ ...VALID_TENANT, slug: 'studio-a3f9c2' })).not.toThrow();
    expect(() =>
      TenantSchema.parse({ ...VALID_TENANT, slug: 'a-very-long-slug-with-many-words-1234ab' }),
    ).not.toThrow();
  });

  it('rejects bad plan values', () => {
    expect(() =>
      // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
      TenantSchema.parse({ ...VALID_TENANT, plan: 'enterprise' as any }),
    ).toThrow();
  });
});

describe('TenantUserSchema', () => {
  const valid = {
    _id: '22222222-2222-4222-8222-222222222222',
    tenantId: '11111111-1111-4111-8111-111111111111',
    userId: '33333333-3333-4333-8333-333333333333',
    role: 'owner' as const,
    acceptedAt: new Date(),
  };

  it('S3: rejects unknown role', () => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
    expect(() => TenantUserSchema.parse({ ...valid, role: 'x' as any })).toThrow();
  });

  it('accepts owner / admin / member', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(() => TenantUserSchema.parse({ ...valid, role })).not.toThrow();
    }
  });
});

describe('slugify', () => {
  const HEX = 'a3f9c2';

  it('S4a: empty name → "workspace-<hex>"', () => {
    expect(slugify('', HEX)).toBe('workspace-a3f9c2');
  });

  it('S4b: all-symbols → "workspace-<hex>"', () => {
    expect(slugify('!!! ??? ###', HEX)).toBe('workspace-a3f9c2');
  });

  it('S4c: unicode → "workspace-<hex>"', () => {
    expect(slugify('नमस्ते', HEX)).toBe('workspace-a3f9c2');
  });

  it('S4d: trims whitespace and apostrophes', () => {
    expect(slugify("  Parvinder's Studio!  ", HEX)).toBe('parvinder-s-studio-a3f9c2');
  });

  it('S4e: collapses repeated separators', () => {
    expect(slugify('A   B   C', HEX)).toBe('a-b-c-a3f9c2');
  });

  it('S4f: truncates very long names', () => {
    const longName = 'a'.repeat(200);
    const result = slugify(longName, HEX);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result.endsWith('-a3f9c2')).toBe(true);
  });

  it('S4g: result matches TenantSchema.slug regex', () => {
    const cases = ['Studio', '   ', 'A B', 'My Workshop! 2024'];
    for (const name of cases) {
      const slug = slugify(name, HEX);
      expect(slug).toMatch(/^[a-z0-9-]{3,64}$/);
    }
  });

  it('S4h: throws on bad randomHex', () => {
    expect(() => slugify('test', 'XYZ')).toThrow();
    expect(() => slugify('test', 'a3f9c')).toThrow(); // 5 chars
    expect(() => slugify('test', 'a3f9c2d')).toThrow(); // 7 chars
  });
});
