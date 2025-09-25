import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/*.spec.ts'],
    exclude: ['test/e2e/**', 'test/legacy-vitest-e2e/**'],
    reporters: 'default',
    maxConcurrency: 1,
  },
});
