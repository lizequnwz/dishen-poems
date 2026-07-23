import { normalizeAudioPreference } from '@/lib/audio-preferences';
import type { AmbientPreset, AudioAsset, AudioPreference } from '@/lib/audio-data';

type PlaybackCatalog = { assets: AudioAsset[]; musicIds: string[]; ambient: AmbientPreset[] };
const STORAGE_KEY = 'dishen-audio-preference';

function readPreference(): AudioPreference {
  try {
    return normalizeAudioPreference(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return normalizeAudioPreference(null);
  }
}

function writePreference(preference: AudioPreference) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Audio remains usable when storage is unavailable.
  }
}

function setupPlayer(player: HTMLElement) {
  if (player.dataset.bound) return;
  player.dataset.bound = 'true';
  const catalog = JSON.parse(player.dataset.audioCatalog ?? '{}') as PlaybackCatalog;
  const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const main = player.querySelector<HTMLAudioElement>('[data-audio-main]')!;
  const ambient = player.querySelector<HTMLAudioElement>('[data-audio-ambient-layer]')!;
  const toggle = player.querySelector<HTMLButtonElement>('[data-audio-toggle]')!;
  const previous = player.querySelector<HTMLButtonElement>('[data-audio-previous]')!;
  const next = player.querySelector<HTMLButtonElement>('[data-audio-next]')!;
  const mainMute = player.querySelector<HTMLButtonElement>('[data-audio-main-mute]')!;
  const ambientMute = player.querySelector<HTMLButtonElement>('[data-audio-ambient-mute]')!;
  const mainVolume = player.querySelector<HTMLInputElement>('[data-audio-main-volume]')!;
  const ambientVolume = player.querySelector<HTMLInputElement>('[data-audio-ambient-volume]')!;
  const ambientSelect = player.querySelector<HTMLSelectElement>('[data-audio-ambient]')!;
  const trackLabel = player.querySelector<HTMLElement>('[data-audio-track-label]')!;
  const status = player.querySelector<HTMLElement>('[data-audio-status]')!;
  const playIcon = player.querySelector<HTMLElement>('[data-audio-play-icon]')!;
  const pauseIcon = player.querySelector<HTMLElement>('[data-audio-pause-icon]')!;
  let preference = readPreference();
  let wantedPlaying = false;
  const failedMain = new Set<string>();
  const failedAmbient = new Set<string>();

  if (!catalog.musicIds.includes(preference.trackId ?? '')) preference.trackId = catalog.musicIds[0] ?? null;
  if (!catalog.ambient.some((preset) => preset.id === preference.ambientId)) preference.ambientId = null;

  function assetForMain() {
    return preference.trackId ? byId.get(preference.trackId) : undefined;
  }

  function assetForAmbient() {
    const preset = catalog.ambient.find((item) => item.id === preference.ambientId);
    return preset ? byId.get(preset.assetId) : undefined;
  }

  function message(zh: string, en: string) {
    status.textContent = document.documentElement.dataset.language === 'en' ? en : zh;
  }

  function setSource(element: HTMLAudioElement, asset: AudioAsset) {
    if (element.dataset.assetId === asset.id) return;
    element.src = asset.mp3.path;
    element.dataset.assetId = asset.id;
  }

  function updateUi() {
    const track = assetForMain();
    trackLabel.textContent = track
      ? document.documentElement.dataset.language === 'en' ? track.title.en : track.title.zh
      : '';
    toggle.setAttribute('aria-pressed', String(wantedPlaying));
    toggle.setAttribute('aria-label', wantedPlaying ? '暂停 / Pause' : '播放古琴 / Play guqin');
    playIcon.hidden = wantedPlaying;
    pauseIcon.hidden = !wantedPlaying;
    mainMute.setAttribute('aria-pressed', String(preference.mainMuted));
    ambientMute.setAttribute('aria-pressed', String(preference.ambientMuted));
    mainVolume.value = String(preference.mainVolume);
    ambientVolume.value = String(preference.ambientVolume);
    ambientSelect.value = preference.ambientId ?? '';
    main.volume = preference.mainVolume;
    ambient.volume = preference.ambientVolume;
    main.muted = preference.mainMuted;
    ambient.muted = preference.ambientMuted;
    writePreference(preference);
  }

  function pauseLayers(reason?: 'background') {
    wantedPlaying = false;
    main.pause();
    ambient.pause();
    if (reason === 'background') message('页面进入后台，声景已暂停。', 'Soundscape paused while the page is in the background.');
    updateUi();
  }

  async function playLayers() {
    const track = assetForMain();
    if (!track || failedMain.size >= catalog.musicIds.length) {
      pauseLayers();
      message('古琴候选均无法播放。', 'No guqin candidate could be played.');
      return;
    }
    wantedPlaying = true;
    setSource(main, track);
    try {
      await main.play();
      const ambience = assetForAmbient();
      if (ambience && !failedAmbient.has(ambience.id)) {
        setSource(ambient, ambience);
        await ambient.play().catch(() => undefined);
      }
      message('正在播放。', 'Playing.');
    } catch {
      wantedPlaying = false;
      message('浏览器未能开始播放，请再试一次。', 'Playback could not start. Please try again.');
    }
    updateUi();
  }

  function moveTrack(delta: number, keepPlaying = wantedPlaying) {
    const current = Math.max(0, catalog.musicIds.indexOf(preference.trackId ?? ''));
    for (let offset = 1; offset <= catalog.musicIds.length; offset += 1) {
      const index = (current + delta * offset + catalog.musicIds.length) % catalog.musicIds.length;
      const id = catalog.musicIds[index];
      if (failedMain.has(id)) continue;
      preference.trackId = id;
      main.pause();
      main.removeAttribute('src');
      delete main.dataset.assetId;
      updateUi();
      if (keepPlaying) void playLayers();
      return;
    }
    pauseLayers();
  }

  toggle.addEventListener('click', () => wantedPlaying ? pauseLayers() : void playLayers());
  previous.addEventListener('click', () => moveTrack(-1));
  next.addEventListener('click', () => moveTrack(1));
  main.addEventListener('ended', () => moveTrack(1, true));
  main.addEventListener('error', () => {
    const failed = assetForMain();
    if (failed) failedMain.add(failed.id);
    if (failedMain.size >= catalog.musicIds.length) {
      pauseLayers();
      message('所有古琴轨道均无法播放。', 'All guqin tracks failed.');
    } else {
      message('当前曲目无法播放，正在尝试下一首。', 'This track failed; trying the next one.');
      moveTrack(1, true);
    }
  });
  ambient.addEventListener('error', () => {
    const failed = assetForAmbient();
    if (failed) failedAmbient.add(failed.id);
    preference.ambientId = null;
    ambient.pause();
    ambient.removeAttribute('src');
    delete ambient.dataset.assetId;
    message('当前环境声无法播放，环境层已关闭。', 'Ambient sound failed and was turned off.');
    updateUi();
  });
  mainMute.addEventListener('click', () => {
    preference.mainMuted = !preference.mainMuted;
    updateUi();
  });
  ambientMute.addEventListener('click', () => {
    preference.ambientMuted = !preference.ambientMuted;
    updateUi();
  });
  mainVolume.addEventListener('input', () => {
    preference.mainVolume = Number(mainVolume.value);
    updateUi();
  });
  ambientVolume.addEventListener('input', () => {
    preference.ambientVolume = Number(ambientVolume.value);
    updateUi();
  });
  ambientSelect.addEventListener('change', () => {
    preference.ambientId = (ambientSelect.value || null) as AudioPreference['ambientId'];
    ambient.pause();
    ambient.removeAttribute('src');
    delete ambient.dataset.assetId;
    updateUi();
    if (wantedPlaying) void playLayers();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && wantedPlaying) pauseLayers('background');
  });
  document.addEventListener('dishen:language-change', updateUi);

  // Restores selections and levels only. Playback always waits for a fresh user gesture.
  wantedPlaying = false;
  updateUi();
}

function setupAudioPlayers() {
  document.querySelectorAll<HTMLElement>('[data-audio-player]').forEach(setupPlayer);
}

document.addEventListener('astro:page-load', setupAudioPlayers);
