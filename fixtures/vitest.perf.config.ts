import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * docs/10 section 5's one Node-side budget. It is a wall clock, so it runs alone: `pnpm test`
 * has 55 files across the machine's cores, and a serializer timed next to them measures the
 * load, not the serializer. `pnpm test:perf` and the phase gate are what run this.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@hmzisb/notion-docs-core': fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'perf',
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['perf/serialize.test.ts'],
    fileParallelism: false,
  },
});
