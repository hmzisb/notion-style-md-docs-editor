import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('src/', import.meta.url));

export default defineConfig({
  // Same two aliases as tsconfig `paths`: tests run against core's source, never a stale dist.
  resolve: {
    alias: {
      '@docs/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      // Trailing slash on both sides, or this entry would also swallow `@docs/core`.
      '@/': src,
    },
  },
  test: {
    name: 'react',
    // docs/10 section 1: react logic and components run in jsdom.
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
  },
});
