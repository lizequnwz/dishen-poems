import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvedPlaybackCatalog } from '../src/lib/audio-data';
import { AUDIO_PREFERENCE_STORAGE_KEY } from '../src/lib/audio-preferences';

const catalog = approvedPlaybackCatalog();

// A small native-control/media double lets these tests control pending play()
// promises and media events without downloading the real soundscape files.
class Control extends EventTarget {
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  hidden = false;
  value = '';
  title = '';
  textContent = '';
  options: Control[] = [];
  children: Control[] = [];
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains(node: unknown) { return node === this || this.children.includes(node as Control); }
  focus() { currentDocument.activeElement = this; }
  click() { this.dispatchEvent(new Event('click')); }
}

class Deck extends Control {
  src = '';
  preload = 'none';
  muted = false;
  volume = 0;
  paused = true;
  duration = 180;
  currentTime = 0;
  load = vi.fn();
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(async () => { this.paused = false; });
  override removeAttribute(name: string) {
    super.removeAttribute(name);
    if (name === 'src') this.src = '';
  }
}

class Player extends Control {
  isConnected = true;
  decks = [new Deck(), new Deck()];
  controls = new Map<string, Control>();
  constructor() {
    super();
    this.dataset = { audioCatalog: JSON.stringify(catalog), preview: 'false' };
    for (const name of ['toggle', 'previous', 'next', 'mute', 'volume', 'volume-label', 'track', 'track-label', 'status', 'detail', 'play-icon', 'pause-icon', 'expand', 'close', 'panel']) {
      this.controls.set(`[data-audio-${name}]`, new Control());
    }
    this.control('panel').children = ['previous', 'next', 'mute', 'volume', 'track', 'close'].map((name) => this.control(name));
    this.control('track').options = catalog.assets.map((asset) => {
      const option = new Control();
      option.value = asset.id;
      option.dataset = { titleZh: asset.displayTitle.zh, titleEn: asset.displayTitle.en };
      return option;
    });
  }
  querySelector(selector: string) { return this.controls.get(selector) ?? null; }
  querySelectorAll(selector: string) { return selector === '[data-audio-deck]' ? this.decks : []; }
  control(name: string) { return this.controls.get(`[data-audio-${name}]`)!; }
}

class PlayerDocument extends EventTarget {
  documentElement = { dataset: { language: 'zh' } };
  activeElement: Control | null = null;
  hidden = false;
  querySelectorAll() { return []; }
}

let currentDocument: PlayerDocument;
let currentWindow: EventTarget;
let storage: Map<string, string>;
let setupPlayer: (player: HTMLElement) => void;
const flushPlayback = async () => {
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
};
const setup = (player = new Player()) => {
  setupPlayer(player as unknown as HTMLElement);
  return player;
};
const deferredPlay = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};

beforeEach(async () => {
  vi.resetModules();
  currentDocument = new PlayerDocument();
  currentWindow = new EventTarget();
  storage = new Map();
  vi.stubGlobal('document', currentDocument);
  vi.stubGlobal('window', currentWindow);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  ({ setupPlayer } = await import('../src/scripts/audio'));
});

afterEach(() => vi.unstubAllGlobals());

describe('compact soundscape controls', () => {
  it('starts collapsed and source-free, including when choosing a track', () => {
    const player = setup();
    expect(player.control('panel').hidden).toBe(true);
    expect(player.control('expand').getAttribute('aria-expanded')).toBe('false');
    player.control('next').click();
    expect(player.control('track').value).toBe(catalog.trackIds[1]);
    for (const deck of player.decks) {
      expect(deck.src).toBe('');
      expect(deck.play).not.toHaveBeenCalled();
    }
  });

  it('restores disclosure/preferences without restoring playback, and Escape returns focus', () => {
    storage.set('dishen-audio-expanded-v1', 'true');
    storage.set(AUDIO_PREFERENCE_STORAGE_KEY, JSON.stringify({ trackId: catalog.trackIds[3], volume: 0.5, muted: true }));
    const player = setup();
    expect(player.control('panel').hidden).toBe(false);
    expect(player.control('track').value).toBe(catalog.trackIds[3]);
    expect(player.control('volume-label').textContent).toBe('50%');
    expect(player.control('mute').getAttribute('aria-pressed')).toBe('true');
    expect(player.control('toggle').getAttribute('aria-pressed')).toBe('false');
    player.control('volume').focus();
    const escape = new Event('keydown');
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    currentDocument.dispatchEvent(escape);
    expect(player.control('panel').hidden).toBe(true);
    expect(currentDocument.activeElement).toBe(player.control('expand'));
    expect(storage.get('dishen-audio-expanded-v1')).toBe('false');
    expect(player.decks.every((deck) => deck.src === '')).toBe(true);
  });

  it('does not replace decks, reload audio or duplicate listeners when expanded or rebound', async () => {
    const player = setup();
    const decks = player.decks;
    setupPlayer(player as unknown as HTMLElement);
    player.control('expand').click();
    player.control('toggle').click();
    await flushPlayback();
    const loadCounts = decks.map((deck) => deck.load.mock.calls.length);
    player.control('expand').click();
    player.control('expand').click();
    expect(player.decks).toBe(decks);
    expect(player.dataset.playbackState).toBe('playing');
    expect(decks[0].play).toHaveBeenCalledTimes(1);
    expect(decks.map((deck) => deck.load.mock.calls.length)).toEqual(loadCounts);
  });
});

describe('pending soundscape playback', () => {
  it('shows loading immediately and cancels a pending start without late playback', async () => {
    const player = setup();
    const pending = deferredPlay();
    player.decks[0].play.mockImplementationOnce(() => pending.promise);
    player.control('toggle').click();
    expect(player.dataset.playbackState).toBe('loading');
    expect(player.control('toggle').getAttribute('aria-label')).toContain('Cancel');
    player.control('toggle').click();
    expect(player.dataset.playbackState).toBe('paused');
    pending.resolve();
    await flushPlayback();
    expect(player.dataset.playbackState).toBe('paused');
    expect(player.control('toggle').getAttribute('aria-pressed')).toBe('false');
    expect(player.decks.every((deck) => deck.paused && deck.src === '')).toBe(true);
  });

  it('cancels loading on background entry and does not resume on foreground entry', async () => {
    const player = setup();
    const pending = deferredPlay();
    player.decks[0].play.mockImplementationOnce(() => pending.promise);
    player.control('toggle').click();
    currentDocument.hidden = true;
    currentDocument.dispatchEvent(new Event('visibilitychange'));
    pending.reject(new Error('aborted'));
    await flushPlayback();
    currentDocument.hidden = false;
    currentDocument.dispatchEvent(new Event('visibilitychange'));
    expect(player.dataset.playbackState).toBe('background');
    expect(player.decks[0].play).toHaveBeenCalledTimes(1);
    expect(player.decks[1].play).not.toHaveBeenCalled();
  });

  it('ignores a superseded start when a different selection is loading', async () => {
    const player = setup();
    const first = deferredPlay();
    const second = deferredPlay();
    player.decks[0].play.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    player.control('toggle').click();
    player.control('next').click();
    first.reject(new Error('old request aborted'));
    await flushPlayback();
    expect(player.control('track').value).toBe(catalog.trackIds[1]);
    expect(player.dataset.playbackState).toBe('loading');
    second.resolve();
    await flushPlayback();
    expect(player.control('track').value).toBe(catalog.trackIds[1]);
    expect(player.dataset.playbackState).toBe('playing');
  });

  it('cancels an incoming crossfade load and preserves the currently playing track', async () => {
    const player = setup();
    player.control('toggle').click();
    await flushPlayback();
    const pending = deferredPlay();
    player.decks[1].play.mockImplementationOnce(() => pending.promise);
    player.control('next').click();
    expect(player.dataset.playbackState).toBe('loading');
    player.control('toggle').click();
    pending.resolve();
    await flushPlayback();
    expect(player.dataset.playbackState).toBe('paused');
    expect(player.control('track').value).toBe(catalog.trackIds[0]);
    expect(player.decks[1].src).toBe('');
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('allows next to advance past a still-loading incoming track', async () => {
    const player = setup();
    player.control('toggle').click();
    await flushPlayback();
    const first = deferredPlay();
    const second = deferredPlay();
    player.decks[1].play.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    player.control('next').click();
    player.control('next').click();
    expect(player.control('track').value).toBe(catalog.trackIds[2]);
    first.reject(new Error('superseded incoming track'));
    await flushPlayback();
    expect(player.dataset.playbackState).toBe('loading');
    second.resolve();
    await flushPlayback();
    expect(player.control('track').value).toBe(catalog.trackIds[2]);
    expect(player.dataset.playbackState).toBe('playing');
    expect(player.decks[1].dataset.assetId).toBe(catalog.trackIds[2]);
  });

  it('skips failures once, stops after all tracks fail, and supports a fresh retry', async () => {
    const player = setup();
    player.decks[0].play.mockImplementation(async () => { throw new Error('offline'); });
    player.control('toggle').click();
    await flushPlayback();
    expect(player.decks[0].play).toHaveBeenCalledTimes(catalog.trackIds.length);
    expect(player.dataset.playbackState).toBe('error');
    expect(player.control('toggle').getAttribute('aria-label')).toContain('Retry');
    player.decks[0].play.mockImplementation(async () => { player.decks[0].paused = false; });
    player.control('toggle').click();
    await flushPlayback();
    expect(player.dataset.playbackState).toBe('playing');
    expect(player.decks[0].play).toHaveBeenCalledTimes(catalog.trackIds.length + 1);
  });

  it('handles an error event and rejected play promise as one failure', async () => {
    const player = setup();
    const pending = deferredPlay();
    player.decks[0].play.mockImplementationOnce(() => pending.promise);
    player.control('toggle').click();
    player.decks[0].dispatchEvent(new Event('error'));
    pending.reject(new Error('failed to load'));
    await flushPlayback();
    expect(player.decks[0].play).toHaveBeenCalledTimes(2);
    expect(player.control('track').value).toBe(catalog.trackIds[1]);
    expect(player.dataset.playbackState).toBe('playing');
  });
});

describe('soundscape page lifecycle', () => {
  it('keeps persisted decks and playback through an Astro route swap', async () => {
    const player = setup();
    player.control('toggle').click();
    await flushPlayback();
    const sources = player.decks.map((deck) => deck.src);
    const loadCounts = player.decks.map((deck) => deck.load.mock.calls.length);
    currentDocument.dispatchEvent(new Event('astro:after-swap'));
    setupPlayer(player as unknown as HTMLElement);
    currentDocument.documentElement.dataset.language = 'en';
    currentDocument.dispatchEvent(new Event('dishen:language-change'));
    expect(player.dataset.playbackState).toBe('playing');
    expect(player.control('track-label').textContent).toBe(catalog.assets[0].displayTitle.en);
    expect(player.decks.map((deck) => deck.src)).toEqual(sources);
    expect(player.decks.map((deck) => deck.load.mock.calls.length)).toEqual(loadCounts);
    expect(player.decks[0].play).toHaveBeenCalledTimes(1);
  });

  it('cancels pending playback and releases listeners when the destination has no player', async () => {
    const player = setup();
    const pending = deferredPlay();
    player.decks[0].play.mockImplementationOnce(() => pending.promise);
    player.control('toggle').click();
    player.isConnected = false;
    currentDocument.dispatchEvent(new Event('astro:after-swap'));
    pending.resolve();
    await flushPlayback();
    expect(player.dataset.playbackState).toBe('paused');
    expect(player.decks.every((deck) => deck.paused && deck.src === '')).toBe(true);
    const pausedStatus = player.control('status').textContent;
    currentDocument.documentElement.dataset.language = 'en';
    currentDocument.dispatchEvent(new Event('dishen:language-change'));
    expect(player.control('status').textContent).toBe(pausedStatus);
  });

  it('pauses on pagehide so restoring the browser page cannot resume sound', async () => {
    const player = setup();
    player.control('toggle').click();
    await flushPlayback();
    currentWindow.dispatchEvent(new Event('pagehide'));
    currentWindow.dispatchEvent(new Event('pageshow'));
    expect(player.dataset.playbackState).toBe('background');
    expect(player.decks.every((deck) => deck.paused)).toBe(true);
    expect(player.decks[0].play).toHaveBeenCalledTimes(1);
  });
});
