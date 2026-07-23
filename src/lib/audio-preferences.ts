import type { AudioPreference } from './audio-data';

export const AUDIO_PANEL_STORAGE_KEY = 'dishen-audio-panel-v1';

export function normalizeAudioPanelExpanded(value: unknown): boolean {
  return value === true;
}

export const defaultAudioPreference: AudioPreference = {
  mainVolume: 0.58,
  ambientVolume: 0.24,
  accentVolume: 0.3,
  mainMuted: false,
  ambientMuted: false,
  accentMuted: false,
  trackId: null,
  ambientId: null,
  accentMode: 'off',
};

const clamp = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function normalizeAudioPreference(value: unknown): AudioPreference {
  if (!value || typeof value !== 'object') return { ...defaultAudioPreference };
  const candidate = value as Partial<AudioPreference>;
  return {
    mainVolume: clamp(candidate.mainVolume, defaultAudioPreference.mainVolume),
    ambientVolume: clamp(candidate.ambientVolume, defaultAudioPreference.ambientVolume),
    accentVolume: clamp(candidate.accentVolume, defaultAudioPreference.accentVolume),
    mainMuted: candidate.mainMuted === true,
    ambientMuted: candidate.ambientMuted === true,
    accentMuted: candidate.accentMuted === true,
    trackId: typeof candidate.trackId === 'string' ? candidate.trackId : null,
    ambientId: ['rain', 'stream', 'forest', 'birds'].includes(candidate.ambientId ?? '')
      ? candidate.ambientId ?? null
      : null,
    accentMode: ['off', 'mixed', 'flute', 'bowl', 'chimes'].includes(candidate.accentMode ?? '')
      ? candidate.accentMode as AudioPreference['accentMode']
      : 'off',
  };
}
