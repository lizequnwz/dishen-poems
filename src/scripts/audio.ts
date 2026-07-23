import {
  AUDIO_PANEL_STORAGE_KEY,
  normalizeAudioPanelExpanded,
  normalizeAudioPreference,
} from '@/lib/audio-preferences';
import {
  ACCENT_DUCK_DELAY_MS,
  AMBIENT_DUCK_MULTIPLIER,
  DUCK_ATTACK_MS,
  DUCK_RELEASE_MS,
  MAIN_DUCK_MULTIPLIER,
  accentDelayMs,
  chooseAccentId,
  effectiveVolume,
} from '@/lib/audio-playback';
import type { AccentPreset, AmbientPreset, AudioAsset, AudioPreference } from '@/lib/audio-data';

type PlaybackCatalog = {
  assets: AudioAsset[];
  musicIds: string[];
  ambient: AmbientPreset[];
  accent: AccentPreset[];
};

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

function readPanelExpanded(): boolean {
  try {
    return normalizeAudioPanelExpanded(JSON.parse(localStorage.getItem(AUDIO_PANEL_STORAGE_KEY) ?? 'null'));
  } catch {
    return false;
  }
}

function writePanelExpanded(expanded: boolean) {
  try {
    localStorage.setItem(AUDIO_PANEL_STORAGE_KEY, JSON.stringify(expanded));
  } catch {
    // The player remains collapsed by default when storage is unavailable.
  }
}

function setupPlayer(player: HTMLElement) {
  if (player.dataset.bound) return;
  player.dataset.bound = 'true';

  const catalog = JSON.parse(player.dataset.audioCatalog ?? '{}') as PlaybackCatalog;
  const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const main = player.querySelector<HTMLAudioElement>('[data-audio-main]')!;
  const ambient = player.querySelector<HTMLAudioElement>('[data-audio-ambient-layer]')!;
  const accent = player.querySelector<HTMLAudioElement>('[data-audio-accent-layer]')!;
  const toggle = player.querySelector<HTMLButtonElement>('[data-audio-toggle]')!;
  const previous = player.querySelector<HTMLButtonElement>('[data-audio-previous]')!;
  const next = player.querySelector<HTMLButtonElement>('[data-audio-next]')!;
  const mainMute = player.querySelector<HTMLButtonElement>('[data-audio-main-mute]')!;
  const ambientMute = player.querySelector<HTMLButtonElement>('[data-audio-ambient-mute]')!;
  const accentMute = player.querySelector<HTMLButtonElement>('[data-audio-accent-mute]');
  const mainVolume = player.querySelector<HTMLInputElement>('[data-audio-main-volume]')!;
  const ambientVolume = player.querySelector<HTMLInputElement>('[data-audio-ambient-volume]')!;
  const accentVolume = player.querySelector<HTMLInputElement>('[data-audio-accent-volume]');
  const ambientSelect = player.querySelector<HTMLSelectElement>('[data-audio-ambient]')!;
  const accentSelect = player.querySelector<HTMLSelectElement>('[data-audio-accent]');
  const trackLabel = player.querySelector<HTMLElement>('[data-audio-track-label]')!;
  const status = player.querySelector<HTMLElement>('[data-audio-status]')!;
  const playIcon = player.querySelector<HTMLElement>('[data-audio-play-icon]')!;
  const pauseIcon = player.querySelector<HTMLElement>('[data-audio-pause-icon]')!;
  const panel = player.querySelector<HTMLElement>('[data-audio-panel]')!;
  const panelToggle = player.querySelector<HTMLButtonElement>('[data-audio-panel-toggle]');
  const preview = player.dataset.preview === 'true';

  let preference = readPreference();
  let panelExpanded = preview || readPanelExpanded();
  let wantedPlaying = false;
  let ducked = false;
  let rampFrame: number | null = null;
  let accentTimer: number | null = null;
  let lastAccentId: string | null = null;
  const failedMain = new Set<string>();
  const failedAmbient = new Set<string>();
  const failedAccent = new Set<string>();

  if (!catalog.musicIds.includes(preference.trackId ?? '')) preference.trackId = catalog.musicIds[0] ?? null;
  if (!catalog.ambient.some((preset) => preset.id === preference.ambientId)) preference.ambientId = null;
  if (!['off', 'mixed', ...catalog.accent.map((preset) => preset.id)].includes(preference.accentMode)) {
    preference.accentMode = 'off';
  }

  function assetForMain() {
    return preference.trackId ? byId.get(preference.trackId) : undefined;
  }

  function assetForAmbient() {
    const preset = catalog.ambient.find((item) => item.id === preference.ambientId);
    return preset ? byId.get(preset.assetId) : undefined;
  }

  function accentIdsForMode() {
    if (preference.accentMode === 'off') return [];
    const presets = preference.accentMode === 'mixed'
      ? catalog.accent
      : catalog.accent.filter((preset) => preset.id === preference.accentMode);
    return presets.flatMap((preset) => preset.assetIds);
  }

  function message(zh: string, en: string) {
    status.textContent = document.documentElement.dataset.language === 'en' ? en : zh;
  }

  function syncPanelState() {
    panel.hidden = !panelExpanded;
    player.classList.toggle('audio-player--expanded', panelExpanded);
    if (!panelToggle) return;
    const english = document.documentElement.dataset.language === 'en';
    panelToggle.setAttribute('aria-expanded', String(panelExpanded));
    panelToggle.setAttribute(
      'aria-label',
      english
        ? panelExpanded ? 'Collapse soundscape settings' : 'Expand soundscape settings'
        : panelExpanded ? '收起声景设置' : '展开声景设置',
    );
  }

  function setPanelExpanded(expanded: boolean) {
    const returnFocus = !expanded && panel.contains(document.activeElement);
    panelExpanded = preview || expanded;
    syncPanelState();
    if (!preview) writePanelExpanded(panelExpanded);
    if (returnFocus) panelToggle?.focus();
  }

  function setSource(element: HTMLAudioElement, asset: AudioAsset) {
    if (element.dataset.assetId === asset.id) return;
    element.src = asset.mp3.path;
    element.dataset.assetId = asset.id;
  }

  function cancelRamp() {
    if (rampFrame !== null) cancelAnimationFrame(rampFrame);
    rampFrame = null;
  }

  function targetVolumes() {
    return {
      main: effectiveVolume(preference.mainVolume, ducked ? MAIN_DUCK_MULTIPLIER : 1),
      ambient: effectiveVolume(preference.ambientVolume, ducked ? AMBIENT_DUCK_MULTIPLIER : 1),
      accent: effectiveVolume(preference.accentVolume),
    };
  }

  function syncVolumes() {
    const targets = targetVolumes();
    main.volume = targets.main;
    ambient.volume = targets.ambient;
    accent.volume = targets.accent;
  }

  function rampVolumes(duration: number) {
    cancelRamp();
    const startedAt = performance.now();
    const startMain = main.volume;
    const startAmbient = ambient.volume;
    const targets = targetVolumes();

    const frame = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
      const eased = progress * (2 - progress);
      main.volume = effectiveVolume(startMain + (targets.main - startMain) * eased);
      ambient.volume = effectiveVolume(startAmbient + (targets.ambient - startAmbient) * eased);
      accent.volume = targets.accent;
      if (progress < 1) rampFrame = requestAnimationFrame(frame);
      else rampFrame = null;
    };

    rampFrame = requestAnimationFrame(frame);
  }

  function updateUi(syncAudio = true) {
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
    accentMute?.setAttribute('aria-pressed', String(preference.accentMuted));
    mainVolume.value = String(preference.mainVolume);
    ambientVolume.value = String(preference.ambientVolume);
    if (accentVolume) accentVolume.value = String(preference.accentVolume);
    ambientSelect.value = preference.ambientId ?? '';
    if (accentSelect) accentSelect.value = preference.accentMode;
    main.muted = preference.mainMuted;
    ambient.muted = preference.ambientMuted;
    accent.muted = preference.accentMuted;
    if (syncAudio) syncVolumes();
    writePreference(preference);
  }

  function clearAccentTimer() {
    if (accentTimer !== null) window.clearTimeout(accentTimer);
    accentTimer = null;
  }

  function accentIsEnabled() {
    return wantedPlaying
      && !document.hidden
      && preference.accentMode !== 'off'
      && !preference.accentMuted
      && preference.accentVolume > 0;
  }

  function scheduleAccent(first: boolean) {
    clearAccentTimer();
    if (!accentIsEnabled() || !accent.paused) return;
    accentTimer = window.setTimeout(() => {
      accentTimer = null;
      void playScheduledAccent();
    }, accentDelayMs(first));
  }

  function restoreAfterAccent() {
    if (!ducked) return;
    ducked = false;
    rampVolumes(DUCK_RELEASE_MS);
  }

  function clearAccentSource() {
    accent.pause();
    accent.removeAttribute('src');
    delete accent.dataset.assetId;
  }

  function finishAccent() {
    clearAccentSource();
    restoreAfterAccent();
    scheduleAccent(false);
  }

  function handleAccentFailure() {
    const failedId = accent.dataset.assetId;
    if (!failedId) return;
    failedAccent.add(failedId);
    clearAccentSource();
    restoreAfterAccent();
    const available = accentIdsForMode().filter((id) => !failedAccent.has(id));
    if (available.length === 0) {
      preference.accentMode = 'off';
      message('所选点缀声均无法播放，点缀层已关闭。', 'Selected accents failed and the accent layer was turned off.');
      updateUi(false);
    } else {
      message('当前点缀声无法播放，稍后尝试下一项。', 'This accent failed; another will be tried later.');
      scheduleAccent(false);
    }
  }

  async function playScheduledAccent() {
    if (!accentIsEnabled()) return;
    const id = chooseAccentId(accentIdsForMode(), failedAccent, lastAccentId);
    if (!id) {
      preference.accentMode = 'off';
      message('所选点缀声均无法播放，点缀层已关闭。', 'Selected accents failed and the accent layer was turned off.');
      updateUi();
      return;
    }
    const asset = byId.get(id);
    if (!asset) return;
    lastAccentId = id;
    setSource(accent, asset);
    ducked = true;
    rampVolumes(DUCK_ATTACK_MS);
    await new Promise((resolve) => window.setTimeout(resolve, ACCENT_DUCK_DELAY_MS));
    if (!accentIsEnabled() || accent.dataset.assetId !== id) {
      clearAccentSource();
      restoreAfterAccent();
      return;
    }
    try {
      await accent.play();
    } catch {
      handleAccentFailure();
    }
  }

  function stopAccent() {
    clearAccentTimer();
    clearAccentSource();
    restoreAfterAccent();
  }

  function pauseLayers(reason?: 'background') {
    wantedPlaying = false;
    clearAccentTimer();
    cancelRamp();
    ducked = false;
    main.pause();
    ambient.pause();
    accent.pause();
    if (reason === 'background') message('页面进入后台，声景已暂停。', 'Soundscape paused while the page is in the background.');
    updateUi();
  }

  async function playLayers() {
    const track = assetForMain();
    if (!track || failedMain.size >= catalog.musicIds.length) {
      pauseLayers();
      message('古琴曲目均无法播放。', 'No guqin track could be played.');
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
      if (accent.paused && accentTimer === null) scheduleAccent(true);
      message('正在播放。', 'Playing.');
    } catch {
      wantedPlaying = false;
      clearAccentTimer();
      message('浏览器未能开始播放，请再试一次。', 'Playback could not start. Please try again.');
    }
    updateUi(false);
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
      updateUi(false);
      if (keepPlaying) void playLayers();
      return;
    }
    pauseLayers();
  }

  function updateBaseVolumes() {
    cancelRamp();
    syncVolumes();
    updateUi(false);
  }

  function updateAccentAvailability() {
    stopAccent();
    updateUi(false);
    if (accentIsEnabled()) scheduleAccent(true);
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
    updateUi(false);
  });
  accent.addEventListener('ended', finishAccent);
  accent.addEventListener('error', handleAccentFailure);
  mainMute.addEventListener('click', () => {
    preference.mainMuted = !preference.mainMuted;
    updateUi(false);
  });
  ambientMute.addEventListener('click', () => {
    preference.ambientMuted = !preference.ambientMuted;
    updateUi(false);
  });
  accentMute?.addEventListener('click', () => {
    preference.accentMuted = !preference.accentMuted;
    updateAccentAvailability();
  });
  mainVolume.addEventListener('input', () => {
    preference.mainVolume = Number(mainVolume.value);
    updateBaseVolumes();
  });
  ambientVolume.addEventListener('input', () => {
    preference.ambientVolume = Number(ambientVolume.value);
    updateBaseVolumes();
  });
  accentVolume?.addEventListener('input', () => {
    preference.accentVolume = Number(accentVolume.value);
    updateBaseVolumes();
    if (preference.accentVolume === 0) stopAccent();
    else if (accentIsEnabled() && accent.paused && accentTimer === null) scheduleAccent(true);
  });
  ambientSelect.addEventListener('change', () => {
    preference.ambientId = (ambientSelect.value || null) as AudioPreference['ambientId'];
    ambient.pause();
    ambient.removeAttribute('src');
    delete ambient.dataset.assetId;
    updateUi(false);
    if (wantedPlaying) void playLayers();
  });
  accentSelect?.addEventListener('change', () => {
    preference.accentMode = accentSelect.value as AudioPreference['accentMode'];
    updateAccentAvailability();
  });
  panelToggle?.addEventListener('click', () => setPanelExpanded(!panelExpanded));
  panel.addEventListener('keydown', (event) => {
    if (!preview && event.key === 'Escape') setPanelExpanded(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && wantedPlaying) pauseLayers('background');
  });
  document.addEventListener('dishen:language-change', () => {
    updateUi(false);
    syncPanelState();
  });

  // Restores selections and levels only. Playback always waits for a fresh user gesture.
  wantedPlaying = false;
  syncPanelState();
  updateUi();
}

function setupAudioPlayers() {
  document.querySelectorAll<HTMLElement>('[data-audio-player]').forEach(setupPlayer);
}

document.addEventListener('astro:page-load', setupAudioPlayers);
