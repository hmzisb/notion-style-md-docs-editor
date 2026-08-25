import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'testing/index': 'src/testing/index.ts' },
  format: ['esm'],
  // The repo builds as composite projects for `tsc -b`, but tsup's dts worker builds a
  // program from the entries alone, and a composite program demands an explicit file
  // list. Turning it off for the declaration pass is the whole fix (TS6307).
  dts: { compilerOptions: { composite: false, incremental: false, declarationMap: false } },
  sourcemap: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: [/^platejs/, /^@platejs\//, /^@docs\//],
});
