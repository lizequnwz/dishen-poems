import { defineConfig } from 'astro/config';
import { pdfReviewDevPlugin } from './scripts/pdf-review-dev-plugin.mjs';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
  vite: {
    plugins: [pdfReviewDevPlugin()],
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
