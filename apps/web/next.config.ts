import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Transpile our workspace package since it ships TypeScript source,
  // not built JavaScript.
  transpilePackages: ['@automatebro/shared'],
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
