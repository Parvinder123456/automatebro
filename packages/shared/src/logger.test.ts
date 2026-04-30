/**
 * Spec 001 §11.1 — logger redaction test.
 *
 * U4: logging an object containing a secret value writes a redaction
 *     marker, not the secret itself.
 *
 * The logger is built on Pino. We hand it a custom write stream so we
 * can capture serialized output deterministically.
 */
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function captureStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('packages/shared/src/logger.ts', () => {
  it('U4: redacts STRICTDB_URI value when logged', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ stream, level: 'info' });

    const secretUri = 'postgresql://user:supersecretpassword@host.example.com:5432/db';
    logger.info({ uri: secretUri }, 'connecting');

    const text = output();
    expect(text).not.toContain('supersecretpassword');
    expect(text).toMatch(/Redacted|REDACTED|\*+/);
  });

  it('U4b: redacts REDIS_URL value when logged', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ stream, level: 'info' });

    const secretRedis = 'rediss://default:redispasswordzzz@host.upstash.io:6379';
    logger.info({ redisUrl: secretRedis }, 'connecting redis');

    const text = output();
    expect(text).not.toContain('redispasswordzzz');
  });

  it('U4c: emits a structured ts/level/msg shape', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ stream, level: 'info' });

    logger.info({ foo: 'bar' }, 'hello world');

    const line = output().trim().split('\n')[0];
    expect(line).toBeDefined();
    const parsed = JSON.parse(line as string) as Record<string, unknown>;
    expect(parsed.msg).toBe('hello world');
    expect(parsed.level).toBeDefined();
    expect(parsed.time ?? parsed.ts).toBeDefined();
    expect(parsed.foo).toBe('bar');
  });
});
