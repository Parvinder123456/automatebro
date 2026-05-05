/**
 * Spec 003 §10.2 — schema unit tests.
 */
import { describe, expect, it } from 'vitest';
import {
  AutomationSchema,
  EventSchema,
  IntentSchema,
  TenantSchema,
  TenantUserSchema,
  TriggerSchema,
  slugify,
} from './schema.js';

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

describe('AutomationSchema (spec 015 — trigger enum)', () => {
  const baseAutomation = {
    _id: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    igAccountId: '33333333-3333-4333-8333-333333333333',
    name: 'Test Automation',
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('A1: accepts trigger="comment" (existing)', () => {
    expect(() => AutomationSchema.parse({ ...baseAutomation, trigger: 'comment' })).not.toThrow();
  });

  it('A2: accepts trigger="dm" (spec 015)', () => {
    expect(() => AutomationSchema.parse({ ...baseAutomation, trigger: 'dm' })).not.toThrow();
  });

  it('A3: accepts trigger="storyReply" + "mention"', () => {
    expect(() =>
      AutomationSchema.parse({ ...baseAutomation, trigger: 'storyReply' }),
    ).not.toThrow();
    expect(() => AutomationSchema.parse({ ...baseAutomation, trigger: 'mention' })).not.toThrow();
  });

  it('A4: rejects unknown trigger value', () => {
    expect(() => AutomationSchema.parse({ ...baseAutomation, trigger: 'banana' })).toThrow();
    expect(() => AutomationSchema.parse({ ...baseAutomation, trigger: 'DM' })).toThrow(); // case-sensitive
  });
});

describe('Spec 016 — IntentSchema + intent fields', () => {
  it('I1: IntentSchema accepts the four labels', () => {
    for (const label of ['buying', 'support', 'spam', 'other'] as const) {
      expect(() => IntentSchema.parse(label)).not.toThrow();
    }
  });

  it('I2: IntentSchema rejects unknown labels (and case mismatches)', () => {
    expect(() => IntentSchema.parse('unknown')).toThrow();
    expect(() => IntentSchema.parse('Buying')).toThrow();
    expect(() => IntentSchema.parse('')).toThrow();
  });

  it('I3: TriggerSchema accepts intents = null / [] / ["buying"]', () => {
    const baseTrigger = {
      _id: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      automationId: '33333333-3333-4333-8333-333333333333',
      keywords: ['LINK'],
      matchMode: 'contains' as const,
    };
    expect(() => TriggerSchema.parse({ ...baseTrigger, intents: null })).not.toThrow();
    expect(() => TriggerSchema.parse({ ...baseTrigger, intents: [] })).not.toThrow();
    expect(() => TriggerSchema.parse({ ...baseTrigger, intents: ['buying'] })).not.toThrow();
    expect(() =>
      TriggerSchema.parse({ ...baseTrigger, intents: ['buying', 'support'] }),
    ).not.toThrow();
  });

  it('I4: TriggerSchema rejects unknown intent value', () => {
    const baseTrigger = {
      _id: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      automationId: '33333333-3333-4333-8333-333333333333',
      keywords: ['LINK'],
      matchMode: 'contains' as const,
    };
    expect(() => TriggerSchema.parse({ ...baseTrigger, intents: ['banana'] })).toThrow();
  });

  it('I5: EventSchema accepts intent + intentConfidence (or null)', () => {
    const baseEvent = {
      _id: '44444444-4444-4444-8444-444444444444',
      tenantId: null,
      metaEventId: 'meta-1',
      kind: 'comment' as const,
      igAccountId: null,
      payload: {},
      signatureVerified: true,
      receivedAt: new Date(),
    };
    expect(() => EventSchema.parse(baseEvent)).not.toThrow();
    expect(() =>
      EventSchema.parse({ ...baseEvent, intent: 'buying', intentConfidence: 0.9 }),
    ).not.toThrow();
    expect(() =>
      EventSchema.parse({ ...baseEvent, intent: null, intentConfidence: null }),
    ).not.toThrow();
  });

  it('I6: EventSchema rejects out-of-range confidence', () => {
    const baseEvent = {
      _id: '44444444-4444-4444-8444-444444444444',
      tenantId: null,
      metaEventId: 'meta-1',
      kind: 'comment' as const,
      igAccountId: null,
      payload: {},
      signatureVerified: true,
      receivedAt: new Date(),
    };
    expect(() =>
      EventSchema.parse({ ...baseEvent, intent: 'buying', intentConfidence: 1.5 }),
    ).toThrow();
    expect(() =>
      EventSchema.parse({ ...baseEvent, intent: 'buying', intentConfidence: -0.1 }),
    ).toThrow();
  });
});
