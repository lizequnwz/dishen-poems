import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pagefind from 'pagefind';
import OpenCC from 'opencc-js';
import { separateHanCharacters } from '../src/lib/archive-search-text.mjs';

const traditionalToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/** Use Pagefind's HTML pipeline, with the same Chinese boundaries as the query. */
function indexedPoemHtml(record) {
  const metadata = Object.entries(record.meta)
    .map(([key, value]) => `<meta data-pagefind-meta="${key}[content]" content="${escapeHtml(value)}">`).join('');
  const body = record.content.slice(record.content.indexOf('\n') + 1);
  return `<html lang="zh"><head>${metadata}</head><body>
    <span data-pagefind-filter="year">${record.filters.year[0]}</span>
    <span data-pagefind-sort="date">${record.sort.date}</span>
    <article data-pagefind-body>
      <h1>${escapeHtml(separateHanCharacters(traditionalToSimplified(record.meta.title)))}</h1>
      <p>${escapeHtml(separateHanCharacters(traditionalToSimplified(body)))}</p>
    </article>
  </body></html>`;
}

/** The same poem-only index serves development and the static build. */
export async function createSearchBundle(records) {
  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'zh' });
  if (errors?.length || !index) throw new Error(errors?.join('\n') || 'Could not create the search index.');
  try {
    for (const record of records) {
      const result = await index.addHTMLFile({ url: record.url, content: indexedPoemHtml(record) });
      if (result.errors?.length) throw new Error(result.errors.join('\n'));
    }
    const result = await index.getFiles();
    if (result.errors?.length || !result.files) throw new Error(result.errors?.join('\n') || 'Search index files are missing.');
    return new Map(result.files.map((file) => [file.path, file.content]));
  } finally {
    await index.deleteIndex();
  }
}

export function searchIntegration() {
  let devBundle;
  return {
    name: 'dishen-poem-search',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        server.watcher.on('all', (_event, file) => {
          if (/\/(poems|imports)\//.test(file) || /\/(site-data|archive-search|archive-search-text|search-records|script-conversion)\.(ts|mjs|json)/.test(file)) {
            devBundle = undefined;
          }
        });
        server.middlewares.use(async (req, res, next) => {
          const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
          if (!pathname.startsWith('/pagefind/')) return next();
          try {
            devBundle ??= (async () => {
              const address = server.httpServer?.address();
              if (!address || typeof address === 'string') throw new Error('The local search server is not ready.');
              const response = await fetch(`http://127.0.0.1:${address.port}/archive/search-records.json`);
              if (!response.ok) throw new Error(`Could not load poems for search (${response.status}).`);
              return createSearchBundle(await response.json());
            })();
            const files = await devBundle;
            const content = files.get(pathname.slice('/pagefind/'.length));
            if (!content) {
              res.statusCode = 404;
              return res.end('Search asset not found.');
            }
            res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(content);
          } catch (error) {
            devBundle = undefined;
            logger.error(error instanceof Error ? error.message : String(error));
            res.statusCode = 500;
            res.end('Search could not be prepared. Please retry.');
          }
        });
      },
      'astro:server:done': async () => { await pagefind.close(); },
      'astro:build:done': async ({ dir, logger }) => {
        try {
          const records = JSON.parse(await readFile(new URL('archive/search-records.json', dir), 'utf8'));
          const files = await createSearchBundle(records);
          const output = fileURLToPath(new URL('pagefind/', dir));
          for (const [path, content] of files) {
            const target = join(output, path);
            await mkdir(join(target, '..'), { recursive: true });
            await writeFile(target, content);
          }
          logger.info(`Indexed ${records.length} poems for Chinese search.`);
        } finally {
          await pagefind.close();
        }
      },
    },
  };
}
