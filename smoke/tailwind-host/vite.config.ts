import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * No aliases: this host resolves `@hmzisb/notion-docs-react` through its exports map, into the built
 * `dist`, which is the whole point of it (docs/11 section 7).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Both smoke hosts run React 18.3, the low end of the peer range, because everything else in
  // the repo runs 19. The package is linked from `packages/react`, whose own node_modules holds
  // the 19 it is developed against - so without this, `dist` resolves that one and the page
  // renders with two Reacts. A real install has none nested, because react is a peer there.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 4331 },
  preview: { port: 4331 },
});
