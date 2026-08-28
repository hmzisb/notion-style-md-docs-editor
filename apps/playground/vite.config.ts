import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const reactSrc = at('../../packages/react/src');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Source, not `dist`: the playground is where the module is developed, so an edit in
    // `packages/react` has to hot-reload here. `smoke/` is what checks the published shape.
    // Longest specifier first - a string alias matches by prefix.
    alias: [
      {
        find: '@hmzisb/notion-docs-react/styles.css',
        replacement: `${reactSrc}/styles/styles.css`,
      },
      { find: '@hmzisb/notion-docs-react/theme.css', replacement: `${reactSrc}/styles/theme.css` },
      {
        find: '@hmzisb/notion-docs-react/adapters/filesystem',
        replacement: `${reactSrc}/adapters/filesystem.ts`,
      },
      {
        find: '@hmzisb/notion-docs-react/adapters/memory',
        replacement: `${reactSrc}/adapters/memory.ts`,
      },
      {
        find: '@hmzisb/notion-docs-react/adapters/http',
        replacement: `${reactSrc}/adapters/http.ts`,
      },
      { find: '@hmzisb/notion-docs-react/shell', replacement: `${reactSrc}/shell/index.ts` },
      { find: '@hmzisb/notion-docs-react/tree', replacement: `${reactSrc}/tree/index.ts` },
      { find: '@hmzisb/notion-docs-react', replacement: `${reactSrc}/index.ts` },
      { find: '@hmzisb/notion-docs-core', replacement: at('../../packages/core/src/index.ts') },
      { find: /^@\/(.*)$/, replacement: `${reactSrc}/$1` },
    ],
  },
  // The demo corpus lives in `fixtures/`, outside this app.
  server: { port: 5173, fs: { allow: [at('../..')] } },
});
