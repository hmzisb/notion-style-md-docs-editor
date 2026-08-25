import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: [/^react/, /^react-dom/, /^@tanstack\//, /^platejs/, /^@platejs\//, /^@docs\//],
  esbuildOptions(o) {
    o.jsx = 'automatic';
  },
});
