import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'tree/index': 'src/tree/index.ts',
    'editor/index': 'src/editor/index.ts',
    'view/index': 'src/view/index.ts',
    'shell/index': 'src/shell/index.ts',
    'adapters/http': 'src/adapters/http.ts',
    'adapters/filesystem': 'src/adapters/filesystem.ts',
    'adapters/memory': 'src/adapters/memory.ts',
  },
  format: ['esm'],
  // Same as core: a composite program needs an explicit file list, which tsup's dts
  // worker does not build (TS6307).
  dts: { compilerOptions: { composite: false, incremental: false, declarationMap: false } },
  sourcemap: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: [/^react/, /^react-dom/, /^@tanstack\//, /^platejs/, /^@platejs\//, /^@docs\//],
  esbuildOptions(o) {
    o.jsx = 'automatic';
  },
  onSuccess: 'pnpm build:css',
});
