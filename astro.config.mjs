// @ts-check
import { defineConfig } from 'astro/config';

// User site: served from https://saintbdrh.github.io/ (no base path).
export default defineConfig({
  site: 'https://saintbdrh.github.io',
  output: 'static',
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
    },
  },
});
