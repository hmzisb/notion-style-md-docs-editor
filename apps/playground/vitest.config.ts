import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

/** The Playwright specs in `e2e/` are not vitest's; everything else in `src/` is. */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { include: ['src/**/*.test.ts'] },
  }),
);
