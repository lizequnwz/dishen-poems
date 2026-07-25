import type { AudioPreference } from './audio-data';

export const AUDIO_PREFERENCE_STORAGE_KEY = 'dishen-audio-preference-v2';
export const LEGACY_AUDIO_PREFERENCE_STORAGE_KEY = 'dishen-audio-preference';

export const defaultAudioPreference: AudioPreference = {
  trackId: null,
  volume: 0.32,
  muted: false,
};

const clampVolume = (value: unknown, fallback = defaultAudioPreference.volume) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;

export function normalizeAudioPreference(value: unknown): AudioPreference {
  if (!value || typeof value !== 'object') return { ...defaultAudioPreference };
  const candidate = value as Partial<AudioPreference>;
  return {
    trackId: typeof candidate.trackId === 'string' ? candidate.trackId : null,
    volume: clampVolume(candidate.volume),
    muted: candidate.muted === true,
  };
}

export function migrateLegacyAudioPreference(value: unknown): AudioPreference {
  if (!value || typeof value !== 'object') return { ...defaultAudioPreference };
  const legacy = value as { mainVolume?: unknown; mainMuted?: unknown };
  return {
    trackId: null,
    volume: Math.min(0.32, clampVolume(legacy.mainVolume)),
    muted: legacy.mainMuted === true,
  };
}
