import {
  clearReadingHistory,
  markLastRead,
  normalizeReadingLibrary,
  readReadingLibrary,
  READING_LIBRARY_STORAGE_KEY,
  toggleSavedPoem,
  writeReadingLibrary,
  type ReadingCatalogEntry,
  type ReadingLibraryState,
} from '@/lib/reading-library';

let catalogRequest: Promise<ReadingCatalogEntry[]> | undefined;
let pageController: AbortController | undefined;

function copy(zh: string, en: string, traditional = zh) {
  if (document.documentElement.dataset.language === 'en') return en;
  return document.documentElement.dataset.script === 'traditional' ? traditional : zh;
}

function readState(ids: ReadonlySet<string>) {
  try { return readReadingLibrary(window.localStorage, ids); }
  catch { return { state: normalizeReadingLibrary(null, ids), available: false }; }
}

function writeState(state: ReadingLibraryState, ids: ReadonlySet<string>) {
  try { return writeReadingLibrary(window.localStorage, state, ids); }
  catch { return false; }
}

function loadCatalog() {
  if (!catalogRequest) {
    catalogRequest = fetch('/poems/library.json').then(async (response) => {
      if (!response.ok) throw new Error('Reading catalog unavailable');
      return await response.json() as ReadingCatalogEntry[];
    }).catch((error) => { catalogRequest = undefined; throw error; });
  }
  return catalogRequest;
}

function titleFor(poem: ReadingCatalogEntry) {
  return document.documentElement.dataset.script === 'traditional' ? poem.title.traditional : poem.title.simplified;
}

function setTitle(element: HTMLElement, poem: ReadingCatalogEntry) {
  element.textContent = titleFor(poem);
  element.lang = document.documentElement.dataset.script === 'traditional' ? 'zh-Hant' : 'zh-Hans';
}

function setDate(element: HTMLTimeElement, poem: ReadingCatalogEntry) {
  element.dateTime = poem.writtenDate;
  element.textContent = poem.writtenDate.replaceAll('-', '.');
}

function setupSaveButton(root: HTMLElement, signal: AbortSignal) {
  const ids = new Set(JSON.parse(root.dataset.catalogIds ?? '[]') as string[]);
  const id = root.dataset.poemId ?? '';
  const button = root.querySelector<HTMLButtonElement>('[data-save-poem]')!;
  const label = root.querySelector<HTMLElement>('[data-save-label]')!;
  const status = root.querySelector<HTMLElement>('[data-save-status]')!;
  let feedback: 'saved' | 'removed' | 'error' | null = null;
  let feedbackTimer: number | undefined;

  function render() {
    const saved = readState(ids).state.savedIds.includes(id);
    button.setAttribute('aria-pressed', String(saved));
    label.textContent = saved ? copy('已收藏', 'Saved') : copy('收藏此诗', 'Save poem', '收藏此詩');
    status.textContent = feedback === 'saved' ? copy('已加入收藏。', 'Poem saved.')
      : feedback === 'removed' ? copy('已从收藏中移除。', 'Poem removed from saved poems.', '已從收藏中移除。')
      : feedback === 'error' ? copy('无法保存；此浏览器未允许本机存储。', 'Could not save. Storage is unavailable in this browser.', '無法保存；此瀏覽器未允許本機儲存。') : '';
  }

  const current = readState(ids);
  if (current.available) writeState(markLastRead(current.state, id, ids), ids);
  render();
  button.addEventListener('click', () => {
    const next = toggleSavedPoem(readState(ids).state, id, ids);
    feedback = writeState(next, ids) ? (next.savedIds.includes(id) ? 'saved' : 'removed') : 'error';
    render();
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => { feedback = null; render(); }, 4_500);
  }, { signal });
  document.addEventListener('dishen:language-change', render, { signal });
  document.addEventListener('dishen:script-change', render, { signal });
  window.addEventListener('storage', (event) => {
    if (event.key === READING_LIBRARY_STORAGE_KEY || event.key === null) render();
  }, { signal });
  signal.addEventListener('abort', () => window.clearTimeout(feedbackTimer), { once: true });
}

async function setupLibrary(root: HTMLElement, signal: AbortSignal) {
  const savedPage = root.dataset.readingLibrary === 'saved';
  const status = root.querySelector<HTMLElement>('[data-library-status]');
  const errorBox = root.querySelector<HTMLElement>('[data-library-error]');
  const errorMessage = root.querySelector<HTMLElement>('[data-library-error-message]');
  const list = root.querySelector<HTMLUListElement>('[data-saved-list]');
  const empty = root.querySelector<HTMLElement>('[data-saved-empty]');
  const lastCard = root.querySelector<HTMLElement>('[data-last-read-card]')!;
  let catalog: ReadingCatalogEntry[] = [];
  let ids = new Set<string>();
  let phase: 'loading' | 'ready' | 'error' | 'unavailable' = 'loading';
  let feedback: 'removed' | 'history-cleared' | 'write-error' | null = null;
  let feedbackTimer: number | undefined;

  function renderStatus(count: number) {
    if (!status || signal.aborted || phase !== 'ready') return;
    status.textContent = feedback === 'removed'
      ? copy('已从收藏中移除。', 'Poem removed from saved poems.', '已從收藏中移除。')
      : feedback === 'history-cleared' ? copy('阅读记录已清除，收藏仍在。', 'Reading history cleared. Saved poems are kept.', '閱讀記錄已清除，收藏仍在。')
      : feedback === 'write-error' ? copy('修改未能保存，请检查浏览器存储设置后重试。', 'Changes could not save. Check browser storage settings and try again.', '修改未能保存，請檢查瀏覽器儲存設定後重試。')
      : copy(`${count} 首收藏`, `${count} saved ${count === 1 ? 'poem' : 'poems'}`);
  }

  function render() {
    if (signal.aborted) return;
    if (phase !== 'ready') {
      lastCard.hidden = true;
      if (list) list.hidden = true;
      if (empty) empty.hidden = true;
      if (errorBox) errorBox.hidden = phase === 'loading';
      if (status) status.textContent = phase === 'loading'
        ? copy('正在载入收藏…', 'Loading saved poems…', '正在載入收藏…')
        : phase === 'unavailable'
          ? copy('无法读取本机收藏。', 'Browser storage is unavailable.', '無法讀取本機收藏。')
          : copy('暂时无法加载收藏。', 'Saved poems could not load.', '暫時無法載入收藏。');
      if (errorMessage) errorMessage.textContent = phase === 'unavailable'
        ? copy('此浏览器未允许读取本机收藏。请检查浏览器的存储设置后重试。', 'Storage is unavailable in this browser. Check your browser settings, then try again.', '此瀏覽器未允許讀取本機收藏。請檢查瀏覽器的儲存設定後重試。')
        : copy('收藏目录暂时无法加载。请重试；作品档案仍可完整浏览。', 'The saved poem catalog could not load. Try again, or continue browsing the archive.', '收藏目錄暫時無法載入。請重試；作品檔案仍可完整瀏覽。');
      return;
    }
    const current = readState(ids);
    if (!current.available) { phase = 'unavailable'; render(); return; }
    const { state } = current;
    const byId = new Map(catalog.map((poem) => [poem.id, poem]));
    const lastRead = state.lastReadId ? byId.get(state.lastReadId) : undefined;
    if (!savedPage) root.hidden = !lastRead && state.savedIds.length === 0;
    lastCard.hidden = !lastRead;
    if (lastRead) {
      root.querySelector<HTMLAnchorElement>('[data-last-read-link]')!.href = lastRead.url;
      setTitle(root.querySelector<HTMLElement>('[data-last-read-title]')!, lastRead);
      setDate(root.querySelector<HTMLTimeElement>('[data-last-read-date]')!, lastRead);
    }
    if (errorBox) errorBox.hidden = true;
    const count = root.querySelector<HTMLElement>('[data-saved-count]');
    if (count) count.textContent = savedPage ? '' : `(${state.savedIds.length})`;
    renderStatus(state.savedIds.length);
    if (!list || !empty) return;
    list.hidden = state.savedIds.length === 0;
    empty.hidden = state.savedIds.length > 0;
    const focused = document.activeElement;
    const focusedId = focused instanceof HTMLElement && list.contains(focused)
      ? focused.closest<HTMLElement>('li')?.dataset.savedPoemId : undefined;
    const focusedRemove = focused instanceof HTMLElement && focused.matches('[data-remove-saved]');
    let restoreFocus: HTMLElement | undefined;
    const fragment = document.createDocumentFragment();
    for (const id of state.savedIds) {
      const poem = byId.get(id)!;
      const item = document.createElement('li');
      item.dataset.savedPoemId = id;
      const link = document.createElement('a');
      link.href = poem.url;
      const title = document.createElement('h2');
      setTitle(title, poem);
      const date = document.createElement('time');
      setDate(date, poem);
      link.append(title, date);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'outline-button';
      remove.dataset.removeSaved = id;
      remove.textContent = copy('移除', 'Remove');
      remove.setAttribute('aria-label', copy(`移除《${titleFor(poem)}》的收藏`, `Remove ${titleFor(poem)} from saved poems`));
      if (id === focusedId) restoreFocus = focusedRemove ? remove : link;
      item.append(link, remove);
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    restoreFocus?.focus({ preventScroll: true });
  }

  async function load() {
    phase = 'loading';
    render();
    try {
      catalog = await loadCatalog();
      if (signal.aborted) return;
      ids = new Set(catalog.map((poem) => poem.id));
      phase = 'ready';
    } catch { phase = 'error'; }
    render();
  }

  function showFeedback(value: typeof feedback) {
    feedback = value;
    window.clearTimeout(feedbackTimer);
    renderStatus(readState(ids).state.savedIds.length);
    feedbackTimer = window.setTimeout(() => {
      feedback = null;
      renderStatus(readState(ids).state.savedIds.length);
    }, 4_500);
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove-saved]');
    if (!button || phase !== 'ready') return;
    const id = button.dataset.removeSaved!;
    const current = readState(ids).state;
    const index = current.savedIds.indexOf(id);
    if (index < 0) return;
    if (!writeState(toggleSavedPoem(current, id, ids), ids)) { showFeedback('write-error'); return; }
    render();
    showFeedback('removed');
    const controls = root.querySelectorAll<HTMLButtonElement>('[data-remove-saved]');
    const nextFocus = controls[Math.min(index, controls.length - 1)] ?? root.querySelector<HTMLAnchorElement>('[data-library-empty-link]');
    nextFocus?.focus();
  }, { signal });
  root.querySelector('[data-clear-reading-history]')?.addEventListener('click', () => {
    if (phase !== 'ready') return;
    const next = clearReadingHistory(readState(ids).state);
    if (!writeState(next, ids)) { showFeedback('write-error'); return; }
    render();
    showFeedback('history-cleared');
    (root.querySelector<HTMLAnchorElement>('[data-saved-list] a') ?? root.querySelector<HTMLAnchorElement>('[data-library-empty-link]'))?.focus();
  }, { signal });
  root.querySelector('[data-library-retry]')?.addEventListener('click', () => void load(), { signal });
  document.addEventListener('dishen:language-change', render, { signal });
  document.addEventListener('dishen:script-change', render, { signal });
  window.addEventListener('storage', (event) => {
    if (event.key !== READING_LIBRARY_STORAGE_KEY && event.key !== null) return;
    if (phase === 'ready') render();
    else void load();
  }, { signal });
  signal.addEventListener('abort', () => window.clearTimeout(feedbackTimer), { once: true });
  if (!savedPage) {
    try { if (!window.localStorage.getItem(READING_LIBRARY_STORAGE_KEY)) return; }
    catch { return; }
  }
  await load();
}

function setup() {
  pageController?.abort();
  pageController = new AbortController();
  const { signal } = pageController;
  const poem = document.querySelector<HTMLElement>('[data-poem-library]');
  if (poem) setupSaveButton(poem, signal);
  document.querySelectorAll<HTMLElement>('[data-reading-library]').forEach((root) => void setupLibrary(root, signal));
}

document.addEventListener('astro:before-swap', () => pageController?.abort());
document.addEventListener('astro:page-load', setup);
