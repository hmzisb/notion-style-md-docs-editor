import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The perf fixtures measure the codec, so they run against core's source like every other
  // project here does, never a stale dist.
  resolve: {
    alias: {
      '@hmzisb/notion-docs-core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'fixtures',
    environment: 'node',
    include: ['**/*.test.ts'],
    // `perf/serialize.test.ts` is a stopwatch, and the default run has 54 other files on the
    // same cores: it belongs to the `perf` project below, which runs on its own.
    exclude: ['perf/serialize.test.ts', '**/node_modules/**'],
    passWithNoTests: true,
  },
});
