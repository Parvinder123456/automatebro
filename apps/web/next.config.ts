import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Load root .env into process.env using Node.js 20.12+ built-in.
// Next.js runs next.config.ts in Node context before its own env loader,
// so vars set here are in place for all server routes and are inlined
// into NEXT_PUBLIC_* slots for Edge Runtime / client bundles.
try {
  process.loadEnvFile(resolve(import.meta.dirname, '..', '..', '.env'));
} catch {
  // No .env file — CI injects env vars directly; this is expected.
}

const config: NextConfig = {
  reactStrictMode: true,
  // Transpile our workspace package since it ships TypeScript source,
  // not built JavaScript.
  transpilePackages: ['@automatebro/shared'],
  // strictdb statically imports every DB driver — only `pg` is used in
  // production, but mongodb / mssql / mysql2 / better-sqlite3 are all
  // pulled into the Server bundle. Webpack then trips on optional peer
  // deps (aws4, kerberos, snappy, etc.). Mark all of them as external
  // so they're require()d at runtime by Node, not bundled by Webpack.
  serverExternalPackages: [
    'strictdb',
    'pg',
    'mongodb',
    'mssql',
    'mysql2',
    'better-sqlite3',
    'bullmq',
    'ioredis',
  ],
  // Map .js imports to .ts source files for the workspace package.
  // Required because we author imports as `from '../env.js'` (ESM-correct
  // for Node) but Next.js webpack doesn't auto-resolve .js → .ts.
  webpack: (cfg) => {
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return cfg;
  },
};

export default config;
