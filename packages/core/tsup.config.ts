import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'testing/index': 'src/testing/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: [/^platejs/, /^@platejs\//, /^@docs\//],
});
