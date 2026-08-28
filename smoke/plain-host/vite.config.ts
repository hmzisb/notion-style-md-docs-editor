import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** No Tailwind and no aliases: precompiled CSS out of `dist`, resolved through the exports map. */
export default defineConfig({
  plugins: [react()],
  // Both smoke hosts run React 18.3, the low end of the peer range, because everything else in
  // the repo runs 19. The package is linked from `packages/react`, whose own node_modules holds
  // the 19 it is developed against - so without this, `dist` resolves that one and the page
  // renders with two Reacts. A real install has none nested, because react is a peer there.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 4332 },
  preview: { port: 4332 },
});
