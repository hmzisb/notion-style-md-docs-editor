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
      { find: '@docs/react/styles.css', replacement: `${reactSrc}/styles/styles.css` },
      { find: '@docs/react/theme.css', replacement: `${reactSrc}/styles/theme.css` },
      {
        find: '@docs/react/adapters/filesystem',
        replacement: `${reactSrc}/adapters/filesystem.ts`,
      },
      { find: '@docs/react/adapters/memory', replacement: `${reactSrc}/adapters/memory.ts` },
      { find: '@docs/react/adapters/http', replacement: `${reactSrc}/adapters/http.ts` },
      { find: '@docs/react/shell', replacement: `${reactSrc}/shell/index.ts` },
      { find: '@docs/react/tree', replacement: `${reactSrc}/tree/index.ts` },
      { find: '@docs/react', replacement: `${reactSrc}/index.ts` },
      { find: '@docs/core', replacement: at('../../packages/core/src/index.ts') },
      { find: /^@\/(.*)$/, replacement: `${reactSrc}/$1` },
    ],
  },
  // The demo corpus lives in `fixtures/`, outside this app.
  server: { port: 5173, fs: { allow: [at('../..')] } },
});
