/**
 * Spec 001 §11.2 — BullMQ queue integration test.
 *
 * I3: eventsQueue exists with name "events", and the underlying ioredis
 *     connection responds to PING with PONG.
 *
 * REQUIRES: a real REDIS_URL in env (Upstash Redis). Skipped if not set.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeQueue, connection, eventsQueue } from './queues.js';

const hasInfra = Boolean(process.env.REDIS_URL);

describe.skipIf(!hasInfra)('packages/shared/src/queue/queues.ts (integration)', () => {
  afterAll(async () => {
    await closeQueue();
  });

  it('I3: eventsQueue exists with the correct name', () => {
    expect(eventsQueue).toBeDefined();
    expect(eventsQueue.name).toBe('events');
  });

  it('I3b: Redis ioredis connection responds to PING', async () => {
    const pong = await connection.ping();
    expect(pong).toBe('PONG');
  });
});

describe.skipIf(hasInfra)('packages/shared/src/queue/queues.ts (no infra)', () => {
  it('skipped: REDIS_URL not set; integration tests not run', () => {
    expect(true).toBe(true);
  });
});
