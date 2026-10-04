import { archiveStateUrl, readArchiveState, validArchiveReturn, type ArchiveState } from '@/lib/archive-navigation';
import { formatSearchExcerpt, separateHanCharacters } from '@/lib/archive-search-text.mjs';

interface PagefindData {
  url: string;
  plain_excerpt?: string;
  meta: Record<string, string>;
}
interface PagefindResult { data(): Promise<PagefindData> }
interface PagefindApi {
  options(options: { excerptLength: number }): Promise<void>;
  search(query: string | null, options: { filters?: { year: string }; sort?: { date: 'desc' } }): Promise<{ results: PagefindResult[] }>;
  destroy(): Promise<void>;
}

const returnStorageKey = 'dishen-archive-return';
const pageSize = 20;
let searchApi: Promise<PagefindApi> | undefined;
let searchLoadAttempt = 0;

function loadSearch() {
  if (!searchApi) {
    const bundle = `/pagefind/pagefind.js${searchLoadAttempt ? `?retry=${searchLoadAttempt}` : ''}`;
    searchApi = import(/* @vite-ignore */ bundle).then(async (module: PagefindApi) => {
      await module.options({ excerptLength: 18 });
      return module;
    }).catch((error) => {
      searchApi = undefined;
      searchLoadAttempt += 1;
      throw error;
    });
  }
  return searchApi;
}

function isEnglish() { return document.documentElement.dataset.language === 'en'; }
function copy(zh: string, en: string) { return isEnglish() ? en : zh; }

function rememberArchiveLink(event: MouseEvent) {
  const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-archive-poem-link]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(window.location.href);
  url.hash = link.id;
  history.replaceState(history.state, '', url);
  try {
    sessionStorage.setItem(returnStorageKey, JSON.stringify({ poemPath: new URL(link.href).pathname, archiveUrl: `${url.pathname}${url.search}${url.hash}`, shown: history.state?.archiveShown ?? pageSize }));
  } catch { /* Reading context is optional if session storage is disabled. */ }
}

function restoreReadingContext() {
  const link = document.querySelector<HTMLAnchorElement>('[data-archive-return]');
  if (!link) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(returnStorageKey) ?? 'null') as { poemPath?: string; archiveUrl?: string } | null;
    if (saved?.poemPath !== window.location.pathname || !saved.archiveUrl) return;
    const url = validArchiveReturn(saved.archiveUrl, window.location.origin);
    if (!url) return;
    link.href = url;
    link.querySelector('[data-copy-zh]')!.textContent = '返回刚才的诗卷';
    link.querySelector('[data-copy-en]')!.textContent = 'Return to your poems';
  } catch { /* The permanent year link remains usable. */ }
}

function setupArchive() {
  restoreReadingContext();
  const candidate = document.querySelector<HTMLElement>('[data-archive-discovery]');
  if (!candidate || candidate.dataset.bound) return;
  const root = candidate;
  root.dataset.bound = 'true';
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const form = root.querySelector<HTMLFormElement>('[data-archive-search-form]')!;
  const input = form.querySelector<HTMLInputElement>('[name=q]')!;
  const year = form.querySelector<HTMLSelectElement>('[name=year]')!;
  const status = root.querySelector<HTMLElement>('[data-archive-status]')!;
  const results = root.querySelector<HTMLElement>('[data-archive-results]')!;
  const feedback = root.querySelector<HTMLElement>('[data-archive-feedback]')!;
  const feedbackMessage = root.querySelector<HTMLElement>('[data-archive-feedback-message]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-archive-retry]')!;
  const more = root.querySelector<HTMLButtonElement>('[data-archive-more]')!;
  const moreWrap = root.querySelector<HTMLElement>('[data-archive-more-wrap]')!;
  const viewControls = root.querySelector<HTMLElement>('[data-archive-view-controls]');
  const gallery = document.querySelector<HTMLElement>('[data-archive-gallery]');
  const list = document.querySelector<HTMLElement>('[data-archive-list]');
  const yearList = document.querySelector<HTMLElement>('[data-archive-year-list]');
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-archive-row]'));
  const years = JSON.parse(root.dataset.years ?? '[]') as string[];
  const defaultYear = root.dataset.defaultYear ?? '';
  let state = readArchiveState(new URL(window.location.href), years, defaultYear);
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let sequence = 0;
  let found: PagefindResult[] = [];
  let shown = 0;
  let phase: 'browse' | 'loading' | 'results' | 'empty' | 'error' = 'browse';
  let hasRestoredAnchor = false;

  function labels() {
    input.placeholder = copy(input.dataset.placeholderZh!, input.dataset.placeholderEn!);
    form.querySelector('[data-all-years]')!.textContent = copy('全部年份', 'All years');
    more.textContent = more.disabled ? copy('正在加载…', 'Loading…') : copy('显示更多作品', 'Show more poems');
    if (phase === 'loading') status.textContent = copy('正在查找诗作…', 'Finding poems…');
    else if (phase === 'error') status.textContent = copy('暂时无法搜索', 'Search is unavailable');
    else if (phase === 'empty') {
      status.textContent = copy('未找到作品', 'No poems found');
      feedbackMessage.textContent = copy('试试另一句诗、较短的关键词，或选择全部年份。', 'Try a shorter Chinese phrase, another line, or all years.');
    } else if (phase === 'results') status.textContent = copy(`找到 ${found.length} 首作品 · 已显示 ${shown} 首`, `${found.length} ${found.length === 1 ? 'poem' : 'poems'} found · ${shown} shown`);
    else {
      const count = rows.filter((row) => !state.year || row.dataset.year === state.year).length;
      status.textContent = copy(`${state.year ? `${state.year} 年 · ` : ''}共 ${count} 首作品`, `${count} ${count === 1 ? 'poem' : 'poems'}${state.year ? ` · ${state.year}` : ''}`);
    }
    if (phase === 'error') feedbackMessage.textContent = copy('搜索未能加载。请重试，或继续按年份浏览；诗文仍可完整阅读。', 'Search could not load. Try again or continue browsing by year. Every poem remains available.');
  }

  function restoreAnchor() {
    if (hasRestoredAnchor || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target && !target.closest('[hidden]')) {
      hasRestoredAnchor = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'instant' }));
    }
  }

  function storeState() {
    history.replaceState(history.state, '', archiveStateUrl(new URL(window.location.href), state, defaultYear));
  }

  function syncControls() {
    input.value = state.query;
    year.value = state.year;
    root.querySelectorAll<HTMLButtonElement>('[data-archive-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.archiveView === state.view)));
  }

  function hideBrowse(hidden: boolean) {
    if (gallery) gallery.hidden = hidden || state.view === 'list';
    if (list) list.hidden = hidden || state.view !== 'list';
    if (yearList) yearList.hidden = hidden;
    document.querySelectorAll<HTMLElement>('[data-archive-months]').forEach((element) => element.hidden = hidden);
    if (viewControls) viewControls.hidden = hidden;
  }

  function restoredResultCount() {
    if (Number.isFinite(history.state?.archiveShown)) return history.state.archiveShown;
    try {
      const saved = JSON.parse(sessionStorage.getItem(returnStorageKey) ?? 'null');
      const url = window.location;
      if (saved?.archiveUrl === `${url.pathname}${url.search}${url.hash}` && Number.isFinite(saved.shown)) return saved.shown;
    } catch { /* The first page remains usable if reading context cannot be restored. */ }
    return pageSize;
  }

  async function appendResults(token: number) {
    const limit = shown === 0 ? Math.max(pageSize, restoredResultCount()) : pageSize;
    const batch = await Promise.all(found.slice(shown, shown + limit).map((result) => result.data()));
    if (token !== sequence || signal.aborted) return;
    const { deriveTextVariants } = await import('@/lib/script-conversion');
    if (token !== sequence || signal.aborted) return;
    const fragment = document.createDocumentFragment();
    for (const data of batch) {
      const path = new URL(data.url, window.location.origin);
      if (path.origin !== window.location.origin || !path.pathname.startsWith('/poems/')) continue;
      const slug = path.pathname.split('/').filter(Boolean).at(-1)!;
      const link = document.createElement('a');
      link.className = 'archive-result';
      link.href = path.pathname;
      link.id = `archive-result-${slug}`;
      link.dataset.archivePoemLink = '';
      const date = document.createElement('time');
      date.dateTime = data.meta.writtenDate;
      date.textContent = data.meta.writtenDate.replaceAll('-', '.');
      const text = document.createElement('div');
      const title = document.createElement('h2');
      const excerpt = document.createElement('p');
      const plainExcerpt = data.plain_excerpt
        ? new DOMParser().parseFromString(data.plain_excerpt, 'text/html').body.textContent ?? ''
        : data.meta.excerpt;
      const variants = deriveTextVariants(formatSearchExcerpt(plainExcerpt, data.meta.title), 'simplified');
      for (const [element, simplified, traditional] of [
        [title, data.meta.title, data.meta.titleTraditional],
        [excerpt, variants.simplified, variants.traditional],
      ] as const) {
        for (const [mode, content] of [['simplified', simplified], ['traditional', traditional]] as const) {
          const span = document.createElement('span');
          span.dataset.scriptInline = mode;
          span.lang = mode === 'traditional' ? 'zh-Hant' : 'zh-Hans';
          span.textContent = content;
          element.append(span);
        }
      }
      const arrow = document.createElement('span');
      arrow.className = 'archive-result__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      text.append(title, excerpt);
      link.append(date, text, arrow);
      fragment.append(link);
    }
    results.append(fragment);
    shown += batch.length;
    phase = 'results';
    feedback.hidden = true;
    retry.hidden = true;
    history.replaceState({ ...history.state, archiveShown: shown }, '', window.location.href);
    moreWrap.hidden = shown >= found.length;
    labels();
    restoreAnchor();
  }

  async function render() {
    const token = ++sequence;
    found = [];
    shown = 0;
    results.replaceChildren();
    results.hidden = true;
    moreWrap.hidden = true;
    feedback.hidden = true;
    retry.hidden = true;
    const searching = Boolean(state.query) || Boolean(defaultYear && state.year !== defaultYear);
    hideBrowse(searching);
    if (!searching) {
      phase = 'browse';
      results.removeAttribute('aria-busy');
      document.querySelectorAll<HTMLElement>('[data-archive-year]').forEach((card) => card.hidden = Boolean(state.year && card.dataset.archiveYear !== state.year));
      rows.forEach((row) => row.hidden = Boolean(state.year && row.dataset.year !== state.year));
      labels();
      restoreAnchor();
      return;
    }
    phase = 'loading';
    results.setAttribute('aria-busy', 'true');
    labels();
    try {
      const [api, { deriveTextVariants }] = await Promise.all([loadSearch(), import('@/lib/script-conversion')]);
      const query = state.query ? separateHanCharacters(deriveTextVariants(state.query, 'traditional').simplified) : null;
      const response = await api.search(query, {
        ...(state.year ? { filters: { year: state.year } } : {}),
        ...(!state.query ? { sort: { date: 'desc' as const } } : {}),
      });
      if (token !== sequence || signal.aborted) return;
      found = response.results;
      if (!found.length) {
        phase = 'empty';
        feedback.hidden = false;
      } else {
        phase = 'results';
        results.hidden = false;
        await appendResults(token);
      }
    } catch {
      if (token !== sequence || signal.aborted) return;
      phase = 'error';
      feedback.hidden = false;
      retry.hidden = false;
    } finally {
      if (token === sequence && !signal.aborted) {
        results.removeAttribute('aria-busy');
        labels();
      }
    }
  }

  function update() {
    state = { ...state, query: input.value.trim(), year: year.value };
    history.replaceState({ ...history.state, archiveShown: pageSize }, '', window.location.href);
    storeState();
    void render();
  }

  function reset() {
    state = { query: '', year: defaultYear, view: 'gallery' };
    syncControls();
    storeState();
    void render();
    input.focus();
  }

  form.hidden = false;
  form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((control) => control.disabled = false);
  root.querySelector<HTMLElement>('[data-archive-search-help]')!.hidden = false;
  syncControls();
  labels();
  void render();
  form.addEventListener('submit', (event) => { event.preventDefault(); clearTimeout(pendingTimer); update(); }, { signal });
  input.addEventListener('input', (event) => {
    if ((event as InputEvent).isComposing) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(update, 250);
  }, { signal });
  year.addEventListener('change', update, { signal });
  root.querySelector('[data-archive-clear]')!.addEventListener('click', reset, { signal });
  root.querySelector('[data-archive-reset]')!.addEventListener('click', reset, { signal });
  retry.addEventListener('click', async () => {
    ++sequence;
    retry.disabled = true;
    try { await (await searchApi)?.destroy(); }
    catch { /* A failed import has no search instance to destroy. */ }
    searchApi = undefined;
    retry.disabled = false;
    if (!signal.aborted) void render();
  }, { signal });
  more.addEventListener('click', async () => {
    const token = sequence;
    more.disabled = true;
    more.setAttribute('aria-busy', 'true');
    labels();
    try { await appendResults(token); }
    catch {
      if (token === sequence && !signal.aborted) { phase = 'error'; feedback.hidden = false; retry.hidden = false; labels(); }
    }
    finally { more.disabled = false; more.removeAttribute('aria-busy'); labels(); }
  }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-archive-view]').forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.archiveView as ArchiveState['view'];
    syncControls();
    storeState();
    void render();
  }, { signal }));
  document.addEventListener('click', rememberArchiveLink, { signal });
  document.addEventListener('dishen:language-change', labels, { signal });
  window.addEventListener('popstate', () => { state = readArchiveState(new URL(window.location.href), years, defaultYear); syncControls(); void render(); }, { signal });
  document.addEventListener('astro:before-swap', () => { clearTimeout(pendingTimer); lifecycle.abort(); }, { once: true });
}

document.addEventListener('astro:page-load', setupArchive);
