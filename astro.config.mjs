import { defineConfig } from 'astro/config';
import { pdfReviewDevPlugin } from './scripts/pdf-review-dev-plugin.mjs';
import { searchIntegration } from './scripts/search-integration.mjs';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [searchIntegration()],
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
