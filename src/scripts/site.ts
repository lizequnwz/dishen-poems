import { normalizeDisplayScript, normalizeUiLanguage, resolveThemePreference, type DisplayScript, type Theme, type UiLanguage } from '@/lib/preferences';
import {
  normalizeReadingSize,
  normalizeReadingView,
  READING_SIZE_STORAGE_KEY,
  READING_VIEW_STORAGE_KEY,
  type ReadingSize,
  type ReadingView,
} from '@/lib/reader-preferences';
import { navigate, type TransitionBeforeSwapEvent } from 'astro:transitions/client';

const storage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Preferences are optional when storage is unavailable.
    }
  },
};

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const english = document.documentElement.dataset.language === 'en';
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', theme === 'dark'
      ? (english ? 'Switch to light theme' : '切换为浅色主题')
      : (english ? 'Switch to dark theme' : '切换为深色主题'));
  });
}

function applyLanguage(language: UiLanguage) {
  document.documentElement.dataset.language = language;
  const script = normalizeDisplayScript(document.documentElement.dataset.script);
  document.documentElement.lang = language === 'zh' ? (script === 'traditional' ? 'zh-Hant' : 'zh-Hans') : 'en';
  document.querySelectorAll<HTMLElement>('[data-language-toggle]').forEach((button) => {
    button.setAttribute('aria-label', language === 'zh' ? 'Switch interface to English' : '将界面切换为中文');
  });
  applyTheme(resolveThemePreference(document.documentElement.dataset.theme, window.matchMedia('(prefers-color-scheme: dark)').matches));
  document.dispatchEvent(new CustomEvent('dishen:language-change'));
}

function applyScript(mode: DisplayScript) {
  document.documentElement.dataset.script = mode;
  if (document.documentElement.dataset.language !== 'en') {
    document.documentElement.lang = mode === 'traditional' ? 'zh-Hant' : 'zh-Hans';
  }
  document.querySelectorAll<HTMLButtonElement>('[data-script-target]').forEach((button) => {
    const active = button.dataset.scriptTarget === mode;
    button.setAttribute('aria-pressed', String(active));
  });
  document.dispatchEvent(new CustomEvent('dishen:script-change'));
}

function applyReadingPreferences(size: ReadingSize, view: ReadingView) {
  document.documentElement.dataset.readingSize = size;
  document.documentElement.dataset.readingView = view;
  document.querySelectorAll<HTMLButtonElement>('[data-reading-size-target]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.readingSizeTarget === size));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-reading-view-target]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.readingViewTarget === view));
  });
  document.dispatchEvent(new CustomEvent('dishen:reading-change'));
}

function setupPreferences() {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      storage.set('dishen-theme', next);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-language-toggle]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.language === 'en' ? 'en' : 'zh';
      const next = current === 'zh' ? 'en' : 'zh';
      applyLanguage(next);
      storage.set('dishen-language', next);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-script-target]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const mode = normalizeDisplayScript(button.dataset.scriptTarget);
      applyScript(mode);
      storage.set('dishen-script', mode);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-reading-size-target]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const size = normalizeReadingSize(button.dataset.readingSizeTarget);
      applyReadingPreferences(size, normalizeReadingView(document.documentElement.dataset.readingView));
      storage.set(READING_SIZE_STORAGE_KEY, size);
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-reading-view-target]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const view = normalizeReadingView(button.dataset.readingViewTarget);
      applyReadingPreferences(normalizeReadingSize(document.documentElement.dataset.readingSize), view);
      storage.set(READING_VIEW_STORAGE_KEY, view);
    });
  });
}

let shareStatusTimer: number | undefined;
let shareRequest = 0;

function resetShareStatus() {
  shareRequest += 1;
  window.clearTimeout(shareStatusTimer);
  shareStatusTimer = undefined;
  const status = document.querySelector<HTMLElement>('[data-share-status]');
  if (status) {
    status.textContent = '';
    delete status.dataset.visible;
  }
}

function showShareStatus(message: string) {
  const status = document.querySelector<HTMLElement>('[data-share-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.visible = 'true';
  window.clearTimeout(shareStatusTimer);
  shareStatusTimer = window.setTimeout(() => {
    status.textContent = '';
    delete status.dataset.visible;
    shareStatusTimer = undefined;
  }, 4_500);
}

function setupShare() {
  document.querySelectorAll<HTMLButtonElement>('[data-share], [data-copy-link]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
      resetShareStatus();
      const request = shareRequest;
      button.disabled = true;
      try {
        const title = button.dataset.shareTitle ?? document.title;
        const url = button.dataset.shareUrl
          ? new URL(button.dataset.shareUrl, window.location.origin).href
          : window.location.href;
        const english = document.documentElement.dataset.language === 'en';
        if (!button.hasAttribute('data-copy-link') && navigator.share) {
          await navigator.share({ title, url });
          if (request === shareRequest && button.isConnected) showShareStatus(english ? 'Shared' : '已分享');
        } else {
          if (!navigator.clipboard) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(url);
          if (request === shareRequest && button.isConnected) showShareStatus(english ? 'Link copied' : '链接已复制');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (request === shareRequest && button.isConnected) {
          showShareStatus(document.documentElement.dataset.language === 'en'
            ? 'Sharing failed. Copy the address from your browser to share this poem.'
            : '分享未成功，请复制浏览器地址分享此诗。');
        }
      } finally {
        button.disabled = false;
      }
    });
  });
}

function setupRandomJourney() {
  document.querySelectorAll<HTMLButtonElement>('[data-random-paths]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const paths = JSON.parse(button.dataset.randomPaths ?? '[]') as string[];
      if (!paths.length) return;
      const candidates = paths.filter((path) => path !== window.location.pathname);
      const pool = candidates.length ? candidates : paths;
      const path = pool[Math.floor(Math.random() * pool.length)];
      void navigate(path);
    });
  });
}

function setupReveals() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    elements.forEach((element) => element.dataset.visible = 'true');
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.visible = 'true';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -5% 0px', threshold: 0.01 },
  );
  elements.forEach((element) => observer.observe(element));
  document.addEventListener('astro:before-swap', () => observer.disconnect(), { once: true });
}

function setupPoemScrollRegions() {
  document.querySelectorAll<HTMLElement>('[data-poem-scroll-region]').forEach((region) => {
    if (region.dataset.scrollBound) return;
    region.dataset.scrollBound = 'true';

    let active = true;
    let frame = 0;
    const sync = () => {
      const overflowing = region.scrollWidth > region.clientWidth + 1;
      region.toggleAttribute('data-overflowing', overflowing);
      region.dataset.scrollEnd = String(!overflowing || region.scrollLeft + region.clientWidth >= region.scrollWidth - 1);
      if (overflowing) {
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
      } else {
        region.removeAttribute('tabindex');
        region.removeAttribute('role');
        region.scrollLeft = 0;
      }
    };
    const scheduleSync = () => {
      if (!active || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    const observer = new ResizeObserver(scheduleSync);
    observer.observe(region);
    region.addEventListener('scroll', scheduleSync, { passive: true });
    region.addEventListener('keydown', (event) => {
      if (!region.hasAttribute('data-overflowing')) return;
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        region.scrollBy({ left: event.key === 'ArrowRight' ? 56 : -56, behavior });
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        region.scrollTo({ left: event.key === 'End' ? region.scrollWidth : 0, behavior });
      }
    });
    document.addEventListener('dishen:script-change', scheduleSync);
    document.addEventListener('dishen:reading-change', scheduleSync);
    document.fonts.addEventListener('loadingdone', scheduleSync);
    void document.fonts.ready.then(scheduleSync);
    document.addEventListener('astro:before-swap', () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      region.removeEventListener('scroll', scheduleSync);
      document.removeEventListener('dishen:script-change', scheduleSync);
      document.removeEventListener('dishen:reading-change', scheduleSync);
      document.fonts.removeEventListener('loadingdone', scheduleSync);
    }, { once: true });
    scheduleSync();
  });
}

function setup() {
  applyLanguage(normalizeUiLanguage(storage.get('dishen-language') ?? document.documentElement.dataset.language));
  applyScript(normalizeDisplayScript(storage.get('dishen-script') ?? document.documentElement.dataset.script));
  applyReadingPreferences(
    normalizeReadingSize(storage.get(READING_SIZE_STORAGE_KEY) ?? document.documentElement.dataset.readingSize),
    normalizeReadingView(storage.get(READING_VIEW_STORAGE_KEY) ?? document.documentElement.dataset.readingView),
  );
  setupPreferences();
  setupShare();
  setupRandomJourney();
  setupReveals();
  setupPoemScrollRegions();
}

document.addEventListener('astro:before-swap', (event) => {
  resetShareStatus();
  const nextRoot = (event as TransitionBeforeSwapEvent).newDocument.documentElement;
  const root = document.documentElement;
  for (const key of ['theme', 'language', 'script', 'readingSize', 'readingView'] as const) {
    const value = root.dataset[key];
    if (value) nextRoot.dataset[key] = value;
  }
  nextRoot.lang = root.lang;
  nextRoot.classList.add('js');
});

document.addEventListener('astro:page-load', setup);
