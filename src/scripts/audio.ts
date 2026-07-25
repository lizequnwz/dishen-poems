import type { AudioAsset, AudioPreference, PlaybackCatalog } from '@/lib/audio-data';
import {
  AUDIO_PREFERENCE_STORAGE_KEY,
  LEGACY_AUDIO_PREFERENCE_STORAGE_KEY,
  migrateLegacyAudioPreference,
  normalizeAudioPreference,
} from '@/lib/audio-preferences';
import {
  AUTO_CROSSFADE_MS,
  MANUAL_CROSSFADE_MS,
  crossfadeGains,
  louderDeck,
  nextPlayableTrackId,
} from '@/lib/audio-playback';

function readPreference(): AudioPreference {
  try {
    const current = localStorage.getItem(AUDIO_PREFERENCE_STORAGE_KEY);
    if (current !== null) return normalizeAudioPreference(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_AUDIO_PREFERENCE_STORAGE_KEY);
    return migrateLegacyAudioPreference(legacy === null ? null : JSON.parse(legacy));
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

function setupPlayer(player: HTMLElement) {
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
  const trackLabel = player.querySelector<HTMLElement>('[data-audio-track-label]')!;
  const status = player.querySelector<HTMLElement>('[data-audio-status]')!;
  const playIcon = player.querySelector<HTMLElement>('[data-audio-play-icon]')!;
  const pauseIcon = player.querySelector<HTMLElement>('[data-audio-pause-icon]')!;

  let preference = readPreference();
  let activeDeck: 0 | 1 = 0;
  let wantedPlaying = false;
  let transition: { from: 0 | 1; to: 0 | 1; fromId: string; toId: string; frame: number } | null = null;
  let hasUserGesture = false;
  const failedIds = new Set<string>();

  if (!catalog.trackIds.includes(preference.trackId ?? '')) preference.trackId = catalog.trackIds[0] ?? null;

  const english = () => document.documentElement.dataset.language === 'en';
  const assetFor = (id: string | null) => id ? byId.get(id) : undefined;

  function message(zh: string, en: string) {
    status.textContent = english() ? en : zh;
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

  function cancelTransition() {
    if (transition) cancelAnimationFrame(transition.frame);
    transition = null;
  }

  function syncVolumes() {
    decks.forEach((deck, index) => {
      deck.muted = preference.muted;
      if (!transition) deck.volume = index === activeDeck ? preference.volume : 0;
    });
  }

  function updateUi(persist = true) {
    const track = assetFor(preference.trackId);
    trackLabel.textContent = track ? (english() ? track.displayTitle.en : track.displayTitle.zh) : '';
    toggle.setAttribute('aria-pressed', String(wantedPlaying));
    toggle.setAttribute('aria-label', wantedPlaying ? '暂停声景 / Pause soundscape' : '播放声景 / Play soundscape');
    playIcon.hidden = wantedPlaying;
    pauseIcon.hidden = !wantedPlaying;
    mute.setAttribute('aria-pressed', String(preference.muted));
    mute.setAttribute('aria-label', preference.muted ? '取消声景静音 / Unmute soundscape' : '声景静音 / Mute soundscape');
    volume.value = String(preference.volume);
    syncVolumes();
    if (persist) writePreference(preference);
  }

  function prefetchNext() {
    if (!hasUserGesture || transition || !preference.trackId) return;
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
    decks[to].volume = preference.volume;
    updateUi();
    prefetchNext();
  }

  async function transitionTo(id: string, duration: number) {
    const asset = assetFor(id);
    if (!asset) return;
    if (!wantedPlaying) {
      preference.trackId = id;
      updateUi();
      return;
    }
    if (transition?.toId === id || decks[activeDeck].dataset.assetId === id) return;

    cancelTransition();
    const from = activeDeck;
    const to = (from === 0 ? 1 : 0) as 0 | 1;
    clearDeck(decks[to]);
    setSource(decks[to], asset);
    decks[to].muted = preference.muted;
    decks[to].volume = 0;
    try {
      await decks[to].play();
    } catch {
      failedIds.add(id);
      clearDeck(decks[to]);
      void recoverFromFailure(id);
      return;
    }

    preference.trackId = id;
    updateUi();
    const fromId = decks[from].dataset.assetId ?? id;
    const startedAt = performance.now();
    const state = { from, to, fromId, toId: id, frame: 0 };
    transition = state;

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
    const asset = assetFor(preference.trackId);
    if (!asset) {
      stopAllFailed();
      return;
    }
    const deck = decks[activeDeck];
    setSource(deck, asset);
    deck.preload = 'auto';
    deck.muted = preference.muted;
    deck.volume = preference.volume;
    try {
      await deck.play();
      wantedPlaying = true;
      message('正在播放。', 'Playing.');
      updateUi();
      prefetchNext();
    } catch {
      failedIds.add(asset.id);
      clearDeck(deck);
      void recoverFromFailure(asset.id);
    }
  }

  function stopAllFailed() {
    wantedPlaying = false;
    cancelTransition();
    decks.forEach(clearDeck);
    message('六首声景均无法播放，播放器已停止。', 'All six soundscapes failed; playback has stopped.');
    updateUi(false);
  }

  async function recoverFromFailure(failedId: string) {
    failedIds.add(failedId);
    const nextId = nextPlayableTrackId(catalog.trackIds, failedId, failedIds);
    if (!nextId) {
      stopAllFailed();
      return;
    }
    preference.trackId = nextId;
    message('当前声景无法播放，正在尝试下一景。', 'This soundscape failed; trying the next one.');
    updateUi();
    if (wantedPlaying || hasUserGesture) {
      wantedPlaying = false;
      await startSelected();
    }
  }

  function pausePlayback(reason?: 'background') {
    if (transition) {
      const kept = louderDeck(decks[0].volume, decks[1].volume);
      const keptId = decks[kept].dataset.assetId;
      cancelTransition();
      activeDeck = kept;
      if (keptId) preference.trackId = keptId;
      clearDeck(decks[kept === 0 ? 1 : 0]);
    }
    decks.forEach((deck) => deck.pause());
    wantedPlaying = false;
    if (reason === 'background') {
      message('页面进入后台，声景已暂停。', 'Soundscape paused while the page is in the background.');
    } else {
      message('已暂停。', 'Paused.');
    }
    updateUi();
  }

  function move(direction: 1 | -1) {
    const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds, direction);
    if (!id) {
      stopAllFailed();
      return;
    }
    if (wantedPlaying) void transitionTo(id, MANUAL_CROSSFADE_MS);
    else {
      preference.trackId = id;
      message('已选择声景，点击播放开始。', 'Soundscape selected; press play to begin.');
      updateUi();
    }
  }

  toggle.addEventListener('click', () => {
    hasUserGesture = true;
    if (wantedPlaying) pausePlayback();
    else void startSelected();
  });
  previous.addEventListener('click', () => {
    hasUserGesture = true;
    move(-1);
  });
  next.addEventListener('click', () => {
    hasUserGesture = true;
    move(1);
  });
  mute.addEventListener('click', () => {
    preference.muted = !preference.muted;
    updateUi();
  });
  volume.addEventListener('input', () => {
    preference.volume = Number(volume.value);
    updateUi();
  });
  decks.forEach((deck, index) => {
    deck.addEventListener('timeupdate', () => {
      if (!wantedPlaying || transition || index !== activeDeck || !Number.isFinite(deck.duration)) return;
      if (deck.duration - deck.currentTime <= AUTO_CROSSFADE_MS / 1_000) {
        const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds);
        if (id) void transitionTo(id, AUTO_CROSSFADE_MS);
      }
    });
    deck.addEventListener('ended', () => {
      if (!wantedPlaying || transition || index !== activeDeck) return;
      const id = nextPlayableTrackId(catalog.trackIds, preference.trackId, failedIds);
      if (id) void transitionTo(id, AUTO_CROSSFADE_MS);
    });
    deck.addEventListener('error', () => {
      const id = deck.dataset.assetId;
      if (!id) return;
      failedIds.add(id);
      if (index === activeDeck || transition?.to === index) void recoverFromFailure(id);
      else clearDeck(deck);
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && wantedPlaying) pausePlayback('background');
  });
  document.addEventListener('dishen:language-change', () => updateUi(false));

  // Only preferences are restored. Both decks remain source-free until a user gesture.
  decks.forEach((deck) => {
    deck.removeAttribute('src');
    deck.preload = 'none';
  });
  updateUi();
}

function setupAudioPlayers() {
  document.querySelectorAll<HTMLElement>('[data-audio-player]').forEach(setupPlayer);
}

document.addEventListener('astro:page-load', setupAudioPlayers);
