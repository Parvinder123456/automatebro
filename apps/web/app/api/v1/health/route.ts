/**
 * GET /api/v1/health
 *
 * Spec 001 §9 — health endpoint contract.
 *
 * Shallow checks in spec 001:
 *  - DB: getDb() resolved without throwing (no real query because no
 *    schemas are registered yet — spec 003 upgrades this).
 *  - Redis: an ephemeral ioredis connection ping() returned PONG.
 *
 * Why an ephemeral Redis connection (NOT the shared queue connection):
 * Vercel serverless cold-starts allocate a new Lambda per instance,
 * and the shared `connection` from queues.ts would leak one TCP
 * connection per Lambda with no teardown hook. Health checks fire
 * frequently (uptime monitors); leaking is unacceptable. We open a
 * connection, ping, and quit() — Redis connection count stays bounded.
 *
 * Both checks run in parallel per CLAUDE.md Rule #8.
 */
import { getDb } from '@automatebro/shared/db/client';
import { loadEnv } from '@automatebro/shared/env';
import { Redis } from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CheckBase {
  ok: boolean;
  error?: string;
}

interface DbCheck extends CheckBase {
  backend?: string;
}

interface RedisCheck extends CheckBase {
  latencyMs?: number;
}

interface HealthResponseBody {
  status: 'ok' | 'degraded';
  version: string;
  checks: { db: DbCheck; redis: RedisCheck };
}

const VERSION = '0.1.0';
const REDIS_TIMEOUT_MS = 2_000;

async function checkDb(): Promise<DbCheck> {
  try {
    const db = await getDb();
    if (typeof db.queryOne !== 'function') {
      return { ok: false, error: 'StrictDB API surface not present' };
    }
    return { ok: true, backend: 'postgresql' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkRedis(): Promise<RedisCheck> {
  let url: string;
  try {
    url = loadEnv().REDIS_URL;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_TIMEOUT_MS,
    lazyConnect: true,
  });
  const start = Date.now();
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis ping timeout')), REDIS_TIMEOUT_MS),
      ),
    ]);
    if (pong !== 'PONG') {
      return { ok: false, error: `unexpected ping reply: ${String(pong)}` };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    // Best-effort cleanup so Lambda doesn't leak a TCP socket.
    redis.disconnect();
  }
}

export async function GET(): Promise<Response> {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const ok = db.ok && redis.ok;
  const body: HealthResponseBody = {
    status: ok ? 'ok' : 'degraded',
    version: VERSION,
    checks: { db, redis },
  };
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
