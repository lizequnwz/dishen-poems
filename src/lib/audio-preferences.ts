import type { AudioPreference } from './audio-data';

export const defaultAudioPreference: AudioPreference = {
  mainVolume: 0.58,
  ambientVolume: 0.24,
  mainMuted: false,
  ambientMuted: false,
  trackId: null,
  ambientId: null,
};

const clamp = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function normalizeAudioPreference(value: unknown): AudioPreference {
  if (!value || typeof value !== 'object') return { ...defaultAudioPreference };
  const candidate = value as Partial<AudioPreference>;
  return {
    mainVolume: clamp(candidate.mainVolume, defaultAudioPreference.mainVolume),
    ambientVolume: clamp(candidate.ambientVolume, defaultAudioPreference.ambientVolume),
    mainMuted: candidate.mainMuted === true,
    ambientMuted: candidate.ambientMuted === true,
    trackId: typeof candidate.trackId === 'string' ? candidate.trackId : null,
    ambientId: ['rain', 'stream', 'forest', 'birds'].includes(candidate.ambientId ?? '')
      ? candidate.ambientId ?? null
      : null,
  };
}
