/**
 * Barrel exports for `@automatebro/shared`.
 *
 * Consumers should generally prefer the deep import paths declared in
 * package.json `exports` (e.g. `@automatebro/shared/db/client`) — they
 * make the dependency graph explicit and tree-shake better. This barrel
 * exists for convenience in places where importing one symbol is fine.
 */
export { Env, loadEnv, type EnvType } from './env.js';
export { createLogger, logger, type CreateLoggerOptions, type LogLevel } from './logger.js';
export { closeDb, getDb } from './db/client.js';
export { closeQueue, connection, eventsQueue } from './queue/queues.js';
