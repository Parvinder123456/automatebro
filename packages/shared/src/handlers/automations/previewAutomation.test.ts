/**
 * Spec 022 / Phase 4.5 — previewAutomation unit tests.
 *
 * The handler reads triggers + responses via repo, so the full
 * integration test is gated on infra. Here we cover the cases that
 * don't need a DB by mocking repo at the module-system level.
 */
import { describe, expect, it, vi } from 'vitest';

const FAKE_CTX = {
  userId: 'u-1',
  tenantId: 't-1',
  role: 'owner' as const,
  email: 'x@y.test',
  tenantDeleted: false,
};

function setRepoMock(opts: {
  trigger: {
    keywords: string[];
    matchMode: 'contains' | 'exact' | 'startsWith';
    postIds?: null;
  } | null;
  response: {
    mode: 'static' | 'ai';
    template?: string | null;
    fallbackTemplate?: string | null;
    commentReply?: string | null;
  } | null;
}): void {
  vi.doMock('../../db/repo.js', () => ({
    repo: {
      async queryOne(collection: string): Promise<unknown> {
        if (collection === 'triggers') return opts.trigger;
        if (collection === 'responses') return opts.response;
        return null;
      },
    },
  }));
}

describe('previewAutomation', () => {
  it('PV1: keyword match in static mode renders the template with vars', async () => {
    setRepoMock({
      trigger: { keywords: ['LINK'], matchMode: 'contains' },
      response: { mode: 'static', template: 'Hi {firstName}! Here it is.' },
    });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const result = await previewAutomation(FAKE_CTX, {
      automationId: 'a-1',
      sampleText: 'send me the LINK please',
      sampleUsername: 'alice',
    });

    expect(result.matched).toBe(true);
    expect(result.matchReason).toContain('LINK');
    expect(result.mode).toBe('static');
    expect(result.renderedContent).toBe('Hi alice! Here it is.');
  });

  it('PV2: no keyword match returns matched=false + tried-keywords reason', async () => {
    setRepoMock({
      trigger: { keywords: ['LINK', 'send'], matchMode: 'contains' },
      response: { mode: 'static', template: 'Hi!' },
    });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const result = await previewAutomation(FAKE_CTX, {
      automationId: 'a-2',
      sampleText: 'hello',
    });

    expect(result.matched).toBe(false);
    expect(result.matchReason).toContain('LINK');
    expect(result.matchReason).toContain('send');
    expect(result.renderedContent).toBeNull();
  });

  it('PV3: AI mode renders the fallback template (AI is runtime-only)', async () => {
    setRepoMock({
      trigger: { keywords: ['help'], matchMode: 'contains' },
      response: {
        mode: 'ai',
        template: '',
        fallbackTemplate: 'Hi {firstName}, support reaches out soon.',
      },
    });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const result = await previewAutomation(FAKE_CTX, {
      automationId: 'a-3',
      sampleText: 'I need help',
      sampleUsername: 'bob',
    });

    expect(result.matched).toBe(true);
    expect(result.mode).toBe('ai');
    expect(result.renderedContent).toBe('Hi bob, support reaches out soon.');
  });

  it('PV4: missing trigger row returns matched=false with explanatory reason', async () => {
    setRepoMock({ trigger: null, response: null });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const result = await previewAutomation(FAKE_CTX, {
      automationId: 'a-4',
      sampleText: 'anything',
    });

    expect(result.matched).toBe(false);
    expect(result.matchReason).toMatch(/Trigger row not found/i);
  });

  it('PV5: exact-match mode is strict', async () => {
    setRepoMock({
      trigger: { keywords: ['LINK'], matchMode: 'exact' },
      response: { mode: 'static', template: 'Here.' },
    });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const exact = await previewAutomation(FAKE_CTX, {
      automationId: 'a-5',
      sampleText: 'LINK',
    });
    expect(exact.matched).toBe(true);

    setRepoMock({
      trigger: { keywords: ['LINK'], matchMode: 'exact' },
      response: { mode: 'static', template: 'Here.' },
    });
    vi.resetModules();
    const { previewAutomation: previewAutomation2 } = await import('./previewAutomation.js');
    const partial = await previewAutomation2(FAKE_CTX, {
      automationId: 'a-5',
      sampleText: 'send me LINK now',
    });
    expect(partial.matched).toBe(false);
  });

  it('PV6: comment-reply renders alongside DM when configured', async () => {
    setRepoMock({
      trigger: { keywords: ['LINK'], matchMode: 'contains' },
      response: {
        mode: 'static',
        template: 'DM: link here.',
        commentReply: 'Check your DMs, {username}!',
      },
    });
    vi.resetModules();
    const { previewAutomation } = await import('./previewAutomation.js');

    const result = await previewAutomation(FAKE_CTX, {
      automationId: 'a-6',
      sampleText: 'LINK',
      sampleUsername: 'charlie',
    });

    expect(result.matched).toBe(true);
    expect(result.renderedContent).toBe('DM: link here.');
    expect(result.renderedCommentReply).toBe('Check your DMs, charlie!');
  });
});
