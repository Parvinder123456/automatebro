import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = resolve(fileURLToPath(import.meta.url), '..');
const SHARED_SRC = resolve(ROOT, 'packages/shared/src');

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'tests/e2e/**',
      'apps/**/__playwright__/**',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/shared/src/**', 'apps/*/src/**', 'apps/web/app/api/**'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: [
      // Subpath imports like '@automatebro/shared/db/client' resolve to
      // the matching .ts file in packages/shared/src. Order matters:
      // the regex match must come BEFORE the bare-name match.
      {
        find: /^@automatebro\/shared\/(.*)$/,
        replacement: resolve(SHARED_SRC, '$1.ts'),
      },
      {
        find: '@automatebro/shared',
        replacement: resolve(SHARED_SRC, 'index.ts'),
      },
    ],
  },
});
