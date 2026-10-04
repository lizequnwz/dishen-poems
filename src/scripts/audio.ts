import type { AudioAsset, AudioPreference, PlaybackCatalog } from '../lib/audio-data';
import { AUDIO_PREFERENCE_STORAGE_KEY, normalizeAudioPreference } from '../lib/audio-preferences';
import {
  AUTO_CROSSFADE_MS,
  MANUAL_CROSSFADE_MS,
  crossfadeGains,
  louderDeck,
  nextPlayableTrackId,
} from '../lib/audio-playback';

const EXPANDED_STORAGE_KEY = 'dishen-audio-expanded-v1';
type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'background' | 'error';
const stateLabels: Record<PlaybackState, { zh: string; en: string }> = {
  idle: { zh: '点按播放', en: 'Press play' },
  loading: { zh: '加载中 · 可取消', en: 'Loading · cancel available' },
  playing: { zh: '播放中', en: 'Playing' },
  paused: { zh: '已暂停', en: 'Paused' },
  background: { zh: '后台已暂停', en: 'Paused in background' },
  error: { zh: '无法播放 · 点击重试', en: 'Unavailable · retry' },
};
const defaultDetail = {
  zh: '声景将依次循环；进入后台时自动暂停。',
  en: 'Soundscapes repeat in order and pause when this page enters the background.',
};

function readPreference(): AudioPreference {
  try {
    return normalizeAudioPreference(JSON.parse(localStorage.getItem(AUDIO_PREFERENCE_STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeAudioPreference(null);
  }
}

function writePreference(preference: AudioPreference) {
  try {
    localStorage.setItem(AUDIO_PREFERENCE_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Playback remains available when storage is blocked.
  }
}

export function setupPlayer(player: HTMLElement) {
  if (player.dataset.bound) return;
  player.dataset.bound = 'true';

  const catalog = JSON.parse(player.dataset.audioCatalog ?? '{}') as PlaybackCatalog;
  const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const decks = [...player.querySelectorAll<HTMLAudioElement>('[data-audio-deck]')];
  const toggle = player.querySelector<HTMLButtonElement>('[data-audio-toggle]')!;
  const previous = player.querySelector<HTMLButtonElement>('[data-audio-previous]')!;
  const next = player.querySelector<HTMLButtonElement>('[data-audio-next]')!;
  const mute = player.querySelector<HTMLButtonElement>('[data-audio-mute]')!;
  const volume = player.querySelector<HTMLInputElement>('[data-audio-volume]')!;
  const volumeLabel = player.querySelector<HTMLOutputElement>('[data-audio-volume-label]')!;
  const trackSelect = player.querySelector<HTMLSelectElement>('[data-audio-track]')!;
  const trackLabel = player.querySelector<HTMLElement>('[data-audio-track-label]')!;
  const status = player.querySelector<HTMLElement>('[data-audio-status]')!;
  const detail = player.querySelector<HTMLElement>('[data-audio-detail]')!;
  const playIcon = player.querySelector<HTMLElement>('[data-audio-play-icon]')!;
  const pauseIcon = player.querySelector<HTMLElement>('[data-audio-pause-icon]')!;
  const expand = player.querySelector<HTMLButtonElement>('[data-audio-expand]');
  const close = player.querySelector<HTMLButtonElement>('[data-audio-close]');
  const panel = player.querySelector<HTMLElement>('[data-audio-panel]')!;
  const preview = player.dataset.preview === 'true';
  const lifecycle = new AbortController();

  let preference = readPreference();
  let activeDeck: 0 | 1 = 0;
  let wantedPlaying = false;
  let playbackState: PlaybackState = 'idle';
  let playbackDetail = defaultDetail;
  let transition: { from: 0 | 1; to: 0 | 1; toId: string; frame: number } | null = null;
  let pendingLoad: { token: number; deck: 0 | 1; id: string } | null = null;
  let operation = 0;
  let hasUserGesture = false;
  const failedIds = new Set<string>();

  if (!catalog.trackIds.includes(preference.trackId ?? '')) preference.trackId = catalog.trackIds[0] ?? null;

  const english = () => document.documentElement.dataset.language === 'en';
  const assetFor = (id: string | null) => id ? byId.get(id) : undefined;

  function setExpanded(expanded: boolean, returnFocus = false) {
    if (preview) return;
    if (!expanded && returnFocus && panel.contains(document.activeElement)) expand?.focus();
    panel.hidden = !expanded;
    expand?.setAttribute('aria-expanded', String(expanded));
    expand?.setAttribute('aria-label', expanded ? '收起声景设置 / Collapse soundscape settings' : '展开声景设置 / Expand soundscape settings');
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
    } catch {
      // Disclosure still works when storage is unavailable.
    }
  }

  function setSource(deck: HTMLAudioElement, asset: AudioAsset) {
    if (deck.dataset.assetId === asset.id) return;
    deck.src = asset.mp3.path;
    deck.dataset.assetId = asset.id;
    deck.load();
  }

  function clearDeck(deck: HTMLAudioElement) {
    deck.pause();
    deck.removeAttribute('src');
    delete deck.dataset.assetId;
    deck.load();
    deck.volume = 0;
  }

  function cancelPendingLoad() {
    operation += 1;
    const pending = pendingLoad;
    pendingLoad = null;
    if (pending) clearDeck(decks[pending.deck]);
  }

  function cancelTransition() {
    if (transition) cancelAnimationFrame(transition.frame);
    transition = null;
  }

  function keepLouderDeck() {
    if (!transition) return;
    const kept = louderDeck(decks[0].volume, decks[1].volume);
    const keptId = decks[kept].dataset.assetId;
    cancelTransition();
    activeDeck = kept;
    if (keptId) preference.trackId = keptId;
    clearDeck(decks[kept === 0 ? 1 : 0]);
  }

  function syncVolumes() {
    decks.forEach((deck, index) => {
      deck.muted = preference.muted;
      if (!transition) deck.volume = index === activeDeck ? preference.volume : 0;
    });
  }

  function updateUi(persist = true) {
    const selectedId = pendingLoad?.id ?? preference.trackId;
    const track = assetFor(selectedId);
    trackLabel.textContent = track ? (english() ? track.displayTitle.en : track.displayTitle.zh) : '';
    trackLabel.title = trackLabel.textContent;
    trackSelect.value = selectedId ?? '';
    for (const option of trackSelect.options) {
      option.textContent = (english() ? option.dataset.titleEn : option.dataset.titleZh) ?? '';
    }
    player.dataset.playbackState = playbackState;
    const label = playbackState === 'playing' && preference.muted
      ? { zh: '已静音', en: 'Muted' }
      : stateLabels[playbackState];
    status.textContent = english() ? label.en : label.zh;
    detail.textContent = english() ? playbackDetail.en : playbackDetail.zh;
    toggle.setAttribute('aria-pressed', String(wantedPlaying));
    toggle.setAttribute('aria-label', wantedPlaying
      ? playbackState === 'loading' ? '取消加载声景 / Cancel soundscape loading' : '暂停声景 / Pause soundscape'
      : playbackState === 'error' ? '重试播放声景 / Retry soundscape playback' : '播放声景 / Play soundscape');
    playIcon.hidden = wantedPlaying;
    pauseIcon.hidden = !wantedPlaying;
    mute.setAttribute('aria-pressed', String(preference.muted));
    mute.setAttribute('aria-label', preference.muted ? '取消声景静音 / Unmute soundscape' : '声景静音 / Mute soundscape');
    volume.value = String(preference.volume);
    volumeLabel.textContent = `${Math.round(preference.volume * 100)}%`;
    volume.setAttribute('aria-valuetext', `${Math.round(preference.volume * 100)}%`);
    syncVolumes();
    if (persist) writePreference(preference);
  }

  function setState(state: PlaybackState, explanation = defaultDetail) {
    playbackState = state;
    playbackDetail = explanation;
    updateUi();
  }

  function prefetchNext() {
    if (!hasUserGesture || !wantedPlaying || transition || pendingLoad || !preference.trackId) return;
    const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds);
    const asset = assetFor(id);
    if (!asset) return;
    const idle = decks[activeDeck === 0 ? 1 : 0];
    setSource(idle, asset);
    idle.preload = 'metadata';
    idle.volume = 0;
  }

  function finishTransition() {
    if (!transition) return;
    const { from, to, toId } = transition;
    cancelTransition();
    clearDeck(decks[from]);
    activeDeck = to;
    preference.trackId = toId;
    setState('playing');
    prefetchNext();
  }

  async function playDeck(index: 0 | 1, asset: AudioAsset) {
    const deck = decks[index];
    const token = ++operation;
    pendingLoad = { token, deck: index, id: asset.id };
    setState('loading');
    setSource(deck, asset);
    deck.preload = 'auto';
    deck.muted = preference.muted;
    deck.volume = index === activeDeck ? preference.volume : 0;
    try {
      await deck.play();
      if (token !== operation || !wantedPlaying) return null;
      pendingLoad = null;
      return token;
    } catch {
      if (token !== operation || !wantedPlaying) return null;
      pendingLoad = null;
      clearDeck(deck);
      await recoverFromFailure(asset.id);
      return null;
    }
  }

  async function transitionTo(id: string, duration: number) {
    const asset = assetFor(id);
    if (!asset) return;
    if (!wantedPlaying) {
      preference.trackId = id;
      setState('idle');
      return;
    }
    if (pendingLoad?.id === id || transition?.toId === id) return;

    cancelPendingLoad();
    keepLouderDeck();
    if (decks[activeDeck].paused) {
      preference.trackId = id;
      await startSelected();
      return;
    }
    if (decks[activeDeck].dataset.assetId === id) {
      preference.trackId = id;
      setState('playing');
      return;
    }
    const from = activeDeck;
    const to = (from === 0 ? 1 : 0) as 0 | 1;
    clearDeck(decks[to]);
    const token = await playDeck(to, asset);
    if (token === null || token !== operation || !wantedPlaying) return;

    preference.trackId = id;
    const startedAt = performance.now();
    const state = { from, to, toId: id, frame: 0 };
    transition = state;
    setState('playing');

    const animate = (now: number) => {
      if (transition !== state) return;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const gains = crossfadeGains(progress, preference.volume);
      decks[from].volume = gains.outgoing;
      decks[to].volume = gains.incoming;
      if (progress >= 1) finishTransition();
      else state.frame = requestAnimationFrame(animate);
    };
    state.frame = requestAnimationFrame(animate);
  }

  async function startSelected() {
    cancelPendingLoad();
    keepLouderDeck();
    const asset = assetFor(preference.trackId);
    if (!asset) {
      stopAllFailed();
      return;
    }
    wantedPlaying = true;
    const token = await playDeck(activeDeck, asset);
    if (token === null || token !== operation || !wantedPlaying) return;
    setState('playing');
    prefetchNext();
  }

  function stopAllFailed() {
    wantedPlaying = false;
    cancelPendingLoad();
    cancelTransition();
    decks.forEach(clearDeck);
    setState('error', {
      zh: '所有声景暂时无法播放。请检查网络，再点击播放重试。',
      en: 'No soundscape could be played. Check your connection and press play to retry.',
    });
  }

  async function recoverFromFailure(failedId: string) {
    if (!wantedPlaying) return;
    failedIds.add(failedId);
    const nextId = nextPlayableTrackId(catalog.trackIds, failedId, failedIds);
    if (!nextId) {
      stopAllFailed();
      return;
    }
    cancelPendingLoad();
    cancelTransition();
    decks.forEach(clearDeck);
    activeDeck = 0;
    preference.trackId = nextId;
    await startSelected();
  }

  function pausePlayback(reason?: 'background') {
    cancelPendingLoad();
    keepLouderDeck();
    decks.forEach((deck) => deck.pause());
    wantedPlaying = false;
    setState(reason === 'background' ? 'background' : 'paused');
  }

  function selectTrack(id: string) {
    if (!catalog.trackIds.includes(id)) return;
    failedIds.delete(id);
    if (wantedPlaying) void transitionTo(id, MANUAL_CROSSFADE_MS);
    else {
      preference.trackId = id;
      setState('idle');
    }
  }

  function move(direction: 1 | -1) {
    // Explicit interaction makes tracks available for a fresh attempt after a network failure.
    if (failedIds.size === catalog.trackIds.length) failedIds.clear();
    const id = nextPlayableTrackId(catalog.trackIds, pendingLoad?.id ?? preference.trackId, failedIds, direction);
    if (id) selectTrack(id);
  }

  toggle.addEventListener('click', () => {
    hasUserGesture = true;
    if (wantedPlaying) pausePlayback();
    else {
      if (playbackState === 'error') failedIds.clear();
      void startSelected();
    }
  });
  previous.addEventListener('click', () => {
    hasUserGesture = true;
    move(-1);
  });
  next.addEventListener('click', () => {
    hasUserGesture = true;
    move(1);
  });
  trackSelect.addEventListener('change', () => {
    hasUserGesture = true;
    selectTrack(trackSelect.value);
  });
  mute.addEventListener('click', () => {
    preference.muted = !preference.muted;
    updateUi();
  });
  volume.addEventListener('input', () => {
    preference.volume = Number(volume.value);
    updateUi();
  });
  expand?.addEventListener('click', () => setExpanded(panel.hidden === true));
  close?.addEventListener('click', () => setExpanded(false, true));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || preview) return;
    setExpanded(false, true);
  }, { signal: lifecycle.signal });

  decks.forEach((deck, index) => {
    deck.addEventListener('timeupdate', () => {
      if (!wantedPlaying || transition || pendingLoad || index !== activeDeck || !Number.isFinite(deck.duration)) return;
      if (deck.duration - deck.currentTime <= AUTO_CROSSFADE_MS / 1_000) {
        const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds);
        if (id) void transitionTo(id, AUTO_CROSSFADE_MS);
      }
    });
    deck.addEventListener('ended', () => {
      if (!wantedPlaying || transition || pendingLoad || index !== activeDeck) return;
      const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds);
      if (id) void transitionTo(id, AUTO_CROSSFADE_MS);
    });
    deck.addEventListener('error', () => {
      const id = deck.dataset.assetId;
      if (!id) return;
      // play() rejects for a loading error; handling it there avoids duplicate recovery.
      if (pendingLoad?.deck === index) return;
      failedIds.add(id);
      if (wantedPlaying && (index === activeDeck || transition?.to === index)) void recoverFromFailure(id);
      else clearDeck(deck);
    });
    deck.addEventListener('waiting', () => {
      if (wantedPlaying && !transition && !pendingLoad && index === activeDeck) setState('loading');
    });
    deck.addEventListener('playing', () => {
      if (wantedPlaying && !pendingLoad && index === activeDeck) setState('playing');
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && wantedPlaying) pausePlayback('background');
  }, { signal: lifecycle.signal });
  window.addEventListener('pagehide', () => {
    if (wantedPlaying) pausePlayback('background');
  }, { signal: lifecycle.signal });
  document.addEventListener('dishen:language-change', () => updateUi(false), { signal: lifecycle.signal });
  document.addEventListener('astro:after-swap', () => {
    // Normal routes retain this node. Preview routes without site chrome remove
    // it, so stop its decks and release document listeners before a new player mounts.
    if (player.isConnected) return;
    pausePlayback();
    decks.forEach(clearDeck);
    lifecycle.abort();
  }, { signal: lifecycle.signal });

  // Only preferences are restored. Both decks remain source-free until a user gesture.
  decks.forEach((deck) => {
    deck.removeAttribute('src');
    deck.preload = 'none';
  });
  if (!preview) {
    let expanded = false;
    try {
      expanded = JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) ?? 'false') === true;
    } catch {
      // A fresh or blocked storage starts with the compact bar.
    }
    setExpanded(expanded);
  }
  updateUi();
}

function setupAudioPlayers() {
  document.querySelectorAll<HTMLElement>('[data-audio-player]').forEach(setupPlayer);
}

document.addEventListener('astro:page-load', setupAudioPlayers);
