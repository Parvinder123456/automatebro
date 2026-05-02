/**
 * Spec 006 §6.1 — JobData discriminator parsing tests.
 */
import { describe, expect, it } from 'vitest';
import { JobData } from './jobTypes.js';

describe('JobData discriminator', () => {
  it('parses process-event variant', () => {
    const parsed = JobData.parse({
      type: 'process-event',
      eventId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.type).toBe('process-event');
  });

  it('parses send-dm variant', () => {
    const parsed = JobData.parse({
      type: 'send-dm',
      sendId: '22222222-2222-4222-8222-222222222222',
      igAccountId: '33333333-3333-4333-8333-333333333333',
      recipientPsid: 'fb-psid-12345',
      content: 'hello',
      automationId: null,
    });
    expect(parsed.type).toBe('send-dm');
  });

  it('parses capture-lead variant', () => {
    const parsed = JobData.parse({
      type: 'capture-lead',
      eventId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.type).toBe('capture-lead');
  });

  it('parses generate-ai-reply variant', () => {
    const parsed = JobData.parse({
      type: 'generate-ai-reply',
      eventId: '11111111-1111-4111-8111-111111111111',
      responseId: '44444444-4444-4444-8444-444444444444',
    });
    expect(parsed.type).toBe('generate-ai-reply');
  });

  it('rejects unknown type', () => {
    expect(() =>
      JobData.parse({ type: 'unknown-type', eventId: '11111111-1111-4111-8111-111111111111' }),
    ).toThrow();
  });

  it('rejects missing fields per variant', () => {
    expect(() => JobData.parse({ type: 'process-event' })).toThrow();
    expect(() => JobData.parse({ type: 'send-dm', sendId: 'not-a-uuid' })).toThrow();
  });
});
