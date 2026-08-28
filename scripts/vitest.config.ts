import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The tools run against core's source, like every other project here.
  resolve: {
    alias: {
      '@hmzisb/notion-docs-core': fileURLToPath(
        new URL('../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'scripts',
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
