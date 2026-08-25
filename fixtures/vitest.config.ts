import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'fixtures',
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
