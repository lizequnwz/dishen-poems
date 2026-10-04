import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as pagefind from 'pagefind';
import { createSearchBundle } from '../scripts/search-integration.mjs';
import { buildArchiveSearchRecords, type ArchivePoem } from '../src/lib/archive-search';
import { formatSearchExcerpt, separateHanCharacters } from '../src/lib/archive-search-text.mjs';
import { deriveTextVariants } from '../src/lib/script-conversion';

interface SearchData { url: string; plain_excerpt: string; meta: Record<string, string> }
interface SearchResult { id: string; data(): Promise<SearchData> }
interface SearchApi {
  options(options: { basePath: string; noWorker: boolean; excerptLength: number }): Promise<void>;
  search(query: string | null, options?: { filters?: { year: string }; sort?: { date: 'desc' } }): Promise<{ results: SearchResult[] }>;
  destroy(): Promise<void>;
}

const poem: ArchivePoem = {
  body: '雲深山外雨，\n嫦娥舞耳畔；\nAlpha storm, 山外清風。\n故園香滿。',
  data: {
    id: 'poem-20260111-example', slug: '2026-01-11-example', title: '風雪潤筆', writtenDate: '2026-01-11',
    originalScript: 'traditional', status: 'verified', scriptOverrides: { simplified: { '故园': '故園' }, traditional: {} },
  },
};
const olderPoem: ArchivePoem = {
  body: '冰雪退至白云边，\n只见花丛不见山。',
  data: { ...poem.data, id: 'poem-20060419-spring', slug: '2006-04-19-spring', title: '春憩', writtenDate: '2006-04-19', originalScript: 'simplified' },
};
const hiddenPoem: ArchivePoem = {
  body: '不可公開的秘密行。',
  data: { ...poem.data, id: 'poem-20260112-hidden', slug: '2026-01-12-hidden', title: '尚未公開', status: 'ingested' },
};

describe('Pagefind archive engine', () => {
  let files: Map<string, Uint8Array>;
  let api: SearchApi;
  let language = 'zh-Hans';
  let failNextFragment = false;

  beforeAll(async () => {
    files = await createSearchBundle(buildArchiveSearchRecords([poem, olderPoem, hiddenPoem]));
    await pagefind.close();
    vi.stubGlobal('document', { currentScript: null, querySelector: () => ({ getAttribute: () => language }) });
    vi.stubGlobal('window', { location: { origin: 'http://archive.test' } });
    vi.stubGlobal('fetch', async (url: string) => {
      const path = new URL(url, 'http://archive.test').pathname.replace(/^\/pagefind\//, '');
      if (failNextFragment && path.startsWith('fragment/')) {
        failNextFragment = false;
        return new Response('Temporarily unavailable', { status: 503 });
      }
      const content = files.get(path);
      return new Response(content ? new Uint8Array(content).buffer : 'Missing', { status: content ? 200 : 404 });
    });
    const source = Buffer.from(files.get('pagefind.js')!).toString('base64');
    api = await import(/* @vite-ignore */ `data:text/javascript;base64,${source}`);
  });
  afterEach(async () => { await api.destroy(); });
  afterAll(() => { vi.unstubAllGlobals(); });

  async function initialize(uiLanguage: string) {
    language = uiLanguage;
    await api.options({ basePath: 'http://archive.test/pagefind/', noWorker: true, excerptLength: 18 });
  }
  async function search(query: string, year?: string) {
    return api.search(separateHanCharacters(deriveTextVariants(query, 'traditional').simplified), year ? { filters: { year } } : {});
  }

  it('finds Chinese titles and lines consistently in Chinese and English UI, in both scripts', async () => {
    for (const uiLanguage of ['zh-Hans', 'en']) {
      await initialize(uiLanguage);
      for (const query of ['风雪润笔', '風雪潤筆', '云深山外雨', '雲深山外雨', '嫦娥舞耳畔', '故园香满', '故園香滿', 'Alpha storm']) {
        const result = await search(query);
        expect(result.results).toHaveLength(1);
        expect((await result.results[0].data()).url).toBe('/poems/2026-01-11-example/');
      }
      await api.destroy();
    }
    expect(poem.body).toContain('故園香滿。');
  });

  it('filters years, sorts chronological results and excludes unreviewed poems', async () => {
    for (const uiLanguage of ['zh-Hans', 'en']) {
      await initialize(uiLanguage);
      expect((await search('云', '2026')).results).toHaveLength(1);
      expect((await search('云', '2006')).results).toHaveLength(1);
      expect((await search('嫦娥', '2006')).results).toHaveLength(0);
      expect((await search('尚未公开')).results).toHaveLength(0);
      expect((await search('秘密行')).results).toHaveLength(0);
      const result = await api.search(null, { sort: { date: 'desc' } });
      const data = await Promise.all(result.results.map((item) => item.data()));
      expect(data.map((item) => item.meta.writtenDate)).toEqual(['2026-01-11', '2006-04-19']);
      await api.destroy();
    }
  });

  it('restores excerpt text without exposing index spaces or joining English words', async () => {
    await initialize('en');
    const result = await search('Alpha storm');
    const data = await result.results[0].data();
    const excerpt = formatSearchExcerpt(data.plain_excerpt, data.meta.title);
    expect(excerpt).toContain('Alpha storm');
    expect(excerpt).toContain('山外清风');
    expect(excerpt).not.toMatch(/\p{Script=Han}\s+\p{Script=Han}/u);
    expect(excerpt).not.toContain('风雪润笔.');
    expect(formatSearchExcerpt('風 雪 潤 筆. 雲 深 山 外 雨。', '風雪潤筆')).toBe('雲深山外雨。');
    expect(formatSearchExcerpt('Alpha storm 山 外 雨， 云 深。', '')).toBe('Alpha storm 山外雨，云深。');
  });

  it('can retry a failed fragment after destroying the failed search instance', async () => {
    await initialize('en');
    failNextFragment = true;
    const first = await search('嫦娥');
    await expect(first.results[0].data()).rejects.toThrow();
    await api.destroy();
    await initialize('en');
    const retried = await search('嫦娥');
    expect((await retried.results[0].data()).meta.title).toBe('风雪润笔');
  });
});
