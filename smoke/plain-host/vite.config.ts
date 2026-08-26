import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** No Tailwind and no aliases: precompiled CSS out of `dist`, resolved through the exports map. */
export default defineConfig({
  plugins: [react()],
  server: { port: 4332 },
  preview: { port: 4332 },
});
