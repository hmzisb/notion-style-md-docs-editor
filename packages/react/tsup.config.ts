import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'tree/index': 'src/tree/index.ts',
    'editor/index': 'src/editor/index.ts',
    'view/index': 'src/view/index.ts',
    'shell/index': 'src/shell/index.ts',
    // An entry of its own so the dynamic import from `IconPicker` resolves to a stable path
    // rather than a hashed chunk: docs/02 section 7 measures `./shell` without it.
    'tree/icon-picker-grid': 'src/tree/icon-picker-grid.tsx',
    // Same reason, for the menu and picker a row only builds when its `⋯` is pressed.
    'tree/row-menu-surface': 'src/tree/row-menu-surface.tsx',
    // Same reason, for the reparenting dialog that only the menu's `Move to` opens.
    'tree/move-to-dialog': 'src/tree/move-to-dialog.tsx',
    // Same reason, for the confirmation `Delete` opens and nothing else mounts.
    'tree/delete-dialog': 'src/tree/delete-dialog.tsx',
    // Same reason, for the palette cmdk lives in (DEV-012).
    'shell/command-palette': 'src/shell/command-palette.tsx',
    // Same reason, for the header menu and the picker and dialogs it opens (docs/06 §8).
    'shell/page-menu-surface': 'src/shell/page-menu-surface.tsx',
    // Same reason, for the draft diff only the mismatch banner's `Compare` opens.
    'shell/draft-compare': 'src/shell/draft-compare.tsx',
    // Same reason, for `sonner` and the one toaster the shell mounts for it (DEV-012).
    'ui/toast-surface': 'src/ui/toast-surface.tsx',
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
      // Without project references, the workspace `paths` would pull `@hmzisb/notion-docs-core`'s source
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
  // Anchored: a bare `/^react/` also externalises `react-dnd`, which docs/11 section 8 lists
  // as bundled.
  external: [
    /^react(\/|$)/,
    /^react-dom(\/|$)/,
    /^@tanstack\//,
    /^platejs(\/|$)/,
    /^@platejs\//,
    /^@docs\//,
  ],
  esbuildOptions(o) {
    o.jsx = 'automatic';
    // `@/*` is the alias the shadcn registry writes; no `@/` import survives into dist.
    o.alias = { '@': fileURLToPath(new URL('src', import.meta.url)) };
  },
  onSuccess: 'pnpm build:css',
});
