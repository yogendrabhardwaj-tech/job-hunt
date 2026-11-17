import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts'],
    setupFiles: ['server/test/setup.ts'],
    environment: 'node',
    // each file gets its own process, so module state (storage mirror, caches) never leaks between files
    pool: 'forks',
  },
});
