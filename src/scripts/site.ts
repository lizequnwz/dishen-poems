import { normalizeDisplayScript, type DisplayScript, type UiLanguage } from '@/lib/preferences';
import { navigate } from 'astro:transitions/client';

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

function applyLanguage(language: UiLanguage) {
  document.documentElement.dataset.language = language;
  const script = normalizeDisplayScript(document.documentElement.dataset.script);
  document.documentElement.lang = language === 'zh' ? (script === 'traditional' ? 'zh-Hant' : 'zh-Hans') : 'en';
  document.querySelectorAll<HTMLElement>('[data-language-toggle]').forEach((button) => {
    button.setAttribute('aria-label', language === 'zh' ? 'Switch interface to English' : '将界面切换为中文');
  });
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
}

function setupPreferences() {
  document.querySelectorAll<HTMLElement>('[data-theme-toggle]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
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
}

function setupShare() {
  document.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
      const title = button.dataset.shareTitle ?? document.title;
      const url = button.dataset.shareUrl
        ? new URL(button.dataset.shareUrl, window.location.origin).href
        : window.location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title, url });
        } else {
          await navigator.clipboard.writeText(url);
          const message = document.querySelector<HTMLElement>('[data-share-status]');
          if (message) {
            message.textContent = document.documentElement.dataset.language === 'en' ? 'Link copied' : '链接已复制';
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
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
    { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
  );
  elements.forEach((element) => observer.observe(element));
}

function setup() {
  applyLanguage((storage.get('dishen-language') === 'en' ? 'en' : 'zh') as UiLanguage);
  applyScript(normalizeDisplayScript(storage.get('dishen-script')));
  setupPreferences();
  setupShare();
  setupRandomJourney();
  setupReveals();
}

document.addEventListener('astro:page-load', setup);
