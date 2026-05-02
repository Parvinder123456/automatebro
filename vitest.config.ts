import { defineConfig } from 'vitest/config';

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
    alias: {
      '@automatebro/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
