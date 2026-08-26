import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * No aliases: this host resolves `@docs/react` through its exports map, into the built
 * `dist`, which is the whole point of it (docs/11 section 7).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 4331 },
  preview: { port: 4331 },
});
