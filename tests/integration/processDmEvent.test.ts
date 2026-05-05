/**
 * Spec 015 §5.1 — processDmEvent integration tests.
 *
 * Gated by `hasInfra`. Each test seeds tenant + igAccount + automation +
 * trigger + response via direct db inserts (the public handlers don't
 * expose seed helpers), then constructs a fake EventRecord and calls
 * `processDmEvent` directly. Assertions hit the `sends` collection.
 *
 * Shape mirrors `tests/integration/sends.test.ts` for the seeding +
 * cleanup conventions.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { getDb } from '@automatebro/shared/db/client';
import { processDmEvent } from '@automatebro/shared/handlers/processDmEvent';
import type { EventRecord, Send } from '@automatebro/shared/types/tenant';
import { afterEach, describe, expect, it } from 'vitest';
import { type TestTenantFixture, createTestTenant } from './_fixtures/tenants.js';

const hasInfra = Boolean(
  process.env.STRICTDB_URI && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

interface SeedOptions {
  trigger: 'comment' | 'dm';
  status: 'active' | 'paused' | 'archived';
  keyword: string;
  matchMode?: 'contains' | 'exact' | 'startsWith';
  responseMode?: 'static' | 'ai';
  template?: string;
}

async function seedIgAccount(tenantId: string): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.insertOne('igAccounts', {
    _id: id,
    tenantId,
    igUserId: `ig-${id.slice(0, 8)}`,
    igUsername: `dmtest_${id.slice(0, 8)}`,
    pageId: `page-${id.slice(0, 8)}`,
    pageName: 'DM Test',
    accessTokenCiphertext: randomBytes(32),
    accessTokenIv: randomBytes(12),
    accessTokenTag: randomBytes(16),
    tokenKeyVersion: 1,
    scopes: ['instagram_basic'],
    connectedAt: new Date(),
  } as never);
  return id;
}

async function seedAutomation(
  tenantId: string,
  igAccountId: string,
  opts: SeedOptions,
): Promise<string> {
  const db = await getDb();
  const automationId = randomUUID();
  const now = new Date();
  await db.insertOne('automations', {
    _id: automationId,
    tenantId,
    igAccountId,
    name: `dm-test-${automationId.slice(0, 8)}`,
    trigger: opts.trigger,
    status: opts.status,
    createdAt: now,
    updatedAt: now,
  } as never);
  await db.insertOne('triggers', {
    _id: randomUUID(),
    tenantId,
    automationId,
    keywords: [opts.keyword],
    matchMode: opts.matchMode ?? 'contains',
    postIds: null,
  } as never);
  await db.insertOne('responses', {
    _id: randomUUID(),
    tenantId,
    automationId,
    mode: opts.responseMode ?? 'static',
    template: opts.template ?? 'Here you go!',
    aiPrompt: null,
    aiTone: null,
    fallbackTemplate: null,
    commentReply: null,
  } as never);
  return automationId;
}

function makeMessageEvent(tenantId: string, igAccountId: string, text: string): EventRecord {
  return {
    _id: randomUUID(),
    tenantId,
    metaEventId: `meta-${randomUUID()}`,
    kind: 'message',
    igAccountId,
    payload: {
      messaging: {
        sender: { id: `psid-${randomUUID().slice(0, 8)}`, username: 'enduser' },
        recipient: { id: 'page-recipient' },
        message: { mid: 'mid-1', text },
      },
    },
    signatureVerified: true,
    receivedAt: new Date(),
    processedAt: null,
  };
}

describe.skipIf(!hasInfra)('processDmEvent (integration)', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const fn = cleanup.pop();
      if (fn) await fn().catch(() => undefined);
    }
  });

  async function freshTenant(prefix: string): Promise<TestTenantFixture> {
    const t = await createTestTenant(prefix);
    cleanup.push(t.cleanup);
    return t;
  }

  it('DM1: keyword match enqueues a send row', async () => {
    const t = await freshTenant('dm1');
    const igId = await seedIgAccount(t.tenantId);
    const automationId = await seedAutomation(t.tenantId, igId, {
      trigger: 'dm',
      status: 'active',
      keyword: 'LINK',
      template: "Here's the link: example.com",
    });

    const event = makeMessageEvent(t.tenantId, igId, 'hey send me the LINK please');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(1);

    const sends = await db.queryMany<Send>(
      'sends',
      { tenantId: t.tenantId, automationId } as never,
      { limit: 10 },
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.kind).toBe('dm');
    expect(sends[0]?.status).toBe('queued');
    expect(sends[0]?.aiGenerated).toBe(false);
    expect(sends[0]?.content).toContain("Here's the link");
    expect(sends[0]?.eventId).toBe(event._id);
  });

  it('DM2: no keyword match → no send', async () => {
    const t = await freshTenant('dm2');
    const igId = await seedIgAccount(t.tenantId);
    await seedAutomation(t.tenantId, igId, {
      trigger: 'dm',
      status: 'active',
      keyword: 'LINK',
    });

    const event = makeMessageEvent(t.tenantId, igId, 'hello');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(0);
    expect(result.enqueued).toBe(0);

    const sends = await db.queryMany<Send>('sends', { tenantId: t.tenantId } as never, {
      limit: 10,
    });
    expect(sends).toHaveLength(0);
  });

  it('DM3: tenant A automation does NOT fire on tenant B event (cross-tenant isolation)', async () => {
    const tA = await freshTenant('dm3a');
    const tB = await freshTenant('dm3b');
    const igA = await seedIgAccount(tA.tenantId);
    const igB = await seedIgAccount(tB.tenantId);
    await seedAutomation(tA.tenantId, igA, {
      trigger: 'dm',
      status: 'active',
      keyword: 'LINK',
    });

    // Event lands on tenant B's igAccount.
    const event = makeMessageEvent(tB.tenantId, igB, 'send me the LINK');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(0);
    expect(result.enqueued).toBe(0);

    const sendsA = await db.queryMany<Send>('sends', { tenantId: tA.tenantId } as never, {
      limit: 10,
    });
    expect(sendsA).toHaveLength(0);
  });

  it('DM4: AI mode enqueues generate-ai-reply (aiGenerated=true)', async () => {
    const t = await freshTenant('dm4');
    const igId = await seedIgAccount(t.tenantId);
    const automationId = await seedAutomation(t.tenantId, igId, {
      trigger: 'dm',
      status: 'active',
      keyword: 'help',
      responseMode: 'ai',
      template: '',
    });

    const event = makeMessageEvent(t.tenantId, igId, 'I need help with my order');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(1);
    expect(result.enqueued).toBe(1);

    const sends = await db.queryMany<Send>(
      'sends',
      { tenantId: t.tenantId, automationId } as never,
      { limit: 10 },
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.aiGenerated).toBe(true);
    // AI-mode stash: content holds the inbound DM text for the AI handler.
    expect(sends[0]?.content).toContain('help');
  });

  it('DM5: paused automation does NOT fire even with matching keyword', async () => {
    const t = await freshTenant('dm5');
    const igId = await seedIgAccount(t.tenantId);
    await seedAutomation(t.tenantId, igId, {
      trigger: 'dm',
      status: 'paused',
      keyword: 'LINK',
    });

    const event = makeMessageEvent(t.tenantId, igId, 'send me the LINK');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(0);
    expect(result.enqueued).toBe(0);
  });

  it('DM6: trigger="comment" automation does NOT fire on a message event', async () => {
    const t = await freshTenant('dm6');
    const igId = await seedIgAccount(t.tenantId);
    await seedAutomation(t.tenantId, igId, {
      trigger: 'comment',
      status: 'active',
      keyword: 'LINK',
    });

    const event = makeMessageEvent(t.tenantId, igId, 'send me the LINK');
    const db = await getDb();
    await db.insertOne('events', event as never);
    const result = await processDmEvent(event);

    expect(result.matched).toBe(0);
    expect(result.enqueued).toBe(0);
  });

  it('DM7: retry dedupe — second call on same eventId is a no-op', async () => {
    const t = await freshTenant('dm7');
    const igId = await seedIgAccount(t.tenantId);
    const automationId = await seedAutomation(t.tenantId, igId, {
      trigger: 'dm',
      status: 'active',
      keyword: 'PING',
    });

    const event = makeMessageEvent(t.tenantId, igId, 'PING');
    const db = await getDb();
    await db.insertOne('events', event as never);

    const first = await processDmEvent(event);
    const second = await processDmEvent(event);

    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0);

    const sends = await db.queryMany<Send>(
      'sends',
      { tenantId: t.tenantId, automationId } as never,
      { limit: 10 },
    );
    expect(sends).toHaveLength(1);
  });
});
