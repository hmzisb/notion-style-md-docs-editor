import { fileURLToPath } from 'node:url';
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
  dts: {
    compilerOptions: {
      // Same as core: a composite program needs an explicit file list, which tsup's dts
      // worker does not build (TS6307).
      composite: false,
      incremental: false,
      declarationMap: false,
      // Without project references, the workspace `paths` would pull `@docs/core`'s source
      // into this program, outside `rootDir` (TS6059). Declarations must point at the
      // package the consumer installs, so only the package-local alias survives here.
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
    },
  },
  sourcemap: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  external: [/^react/, /^react-dom/, /^@tanstack\//, /^platejs/, /^@platejs\//, /^@docs\//],
  esbuildOptions(o) {
    o.jsx = 'automatic';
    // `@/*` is the alias the shadcn registry writes; no `@/` import survives into dist.
    o.alias = { '@': fileURLToPath(new URL('src', import.meta.url)) };
  },
  onSuccess: 'pnpm build:css',
});
