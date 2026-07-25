import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvedAudioAssets,
  approvedPlaybackCatalog,
  audioAssets,
  soundscapePlaylist,
  validateAudioCatalog,
  type AudioAsset,
} from '../src/lib/audio-data';
import {
  AUTO_CROSSFADE_MS,
  MANUAL_CROSSFADE_MS,
  crossfadeGains,
  louderDeck,
  nextPlayableTrackId,
} from '../src/lib/audio-playback';
import {
  defaultAudioPreference,
  migrateLegacyAudioPreference,
  normalizeAudioPreference,
} from '../src/lib/audio-preferences';

const projectRoot = join(import.meta.dirname, '..');
const expectedOrder = [
  'soundscape-morning-mist-1',
  'soundscape-sea-of-clouds-1',
  'soundscape-still-waters-1',
  'soundscape-morning-mist-2',
  'soundscape-sea-of-clouds-2',
  'soundscape-still-waters-2',
];

describe('six-track soundscape catalog', () => {
  it('publishes three themes with two unique variants in the fixed order', () => {
    expect(audioAssets).toHaveLength(6);
    expect(approvedAudioAssets).toHaveLength(6);
    expect(soundscapePlaylist.assetIds).toEqual(expectedOrder);
    expect(approvedPlaybackCatalog().trackIds).toEqual(expectedOrder);
    expect(new Set(audioAssets.map((asset) => `${asset.theme}:${asset.variant}`)).size).toBe(6);
    expect(audioAssets.every((asset) => asset.role === 'soundscape')).toBe(true);
  });

  it('keeps complete, permitted source records for every finished mix', () => {
    const permitted = new Set([
      'https://creativecommons.org/licenses/by/4.0/',
      'https://creativecommons.org/publicdomain/zero/1.0/',
      'https://creativecommons.org/publicdomain/mark/1.0/',
    ]);
    for (const asset of audioAssets) {
      expect(asset.sources.length).toBeGreaterThan(0);
      for (const source of asset.sources) {
        expect(source.title).toBeTruthy();
        expect(source.creator).toBeTruthy();
        expect(source.sourcePage).toMatch(/^https:\/\//);
        expect(source.originalFile).toBeTruthy();
        expect(source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(permitted.has(source.license.url)).toBe(true);
      }
    }
  });

  it('rejects duplicate theme variants', () => {
    const invalid = audioAssets.map((asset) => structuredClone(asset)) as AudioAsset[];
    invalid[1].theme = invalid[0].theme;
    invalid[1].variant = invalid[0].variant;
    expect(() => validateAudioCatalog(invalid)).toThrow('Duplicate theme variant');
  });

  it('ships matching public MP3 checksums below 12 MiB', () => {
    for (const asset of approvedAudioAssets) {
      const path = join(projectRoot, asset.mp3.localFile);
      const bytes = statSync(path).size;
      const checksum = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(asset.mp3.path).toMatch(/^\/audio\/.*\.mp3$/);
      expect(bytes).toBe(asset.mp3.bytes);
      expect(bytes).toBeLessThan(12 * 1024 * 1024);
      expect(checksum).toBe(asset.mp3.sha256);
    }
  });
});

describe('audio preferences v2', () => {
  it('restores one selection, one level and mute without playback state', () => {
    expect(normalizeAudioPreference({ trackId: 'soundscape-still-waters-2', volume: 3, muted: true, playing: true })).toEqual({
      trackId: 'soundscape-still-waters-2',
      volume: 1,
      muted: true,
    });
    expect(defaultAudioPreference).toEqual({ trackId: null, volume: 0.32, muted: false });
  });

  it('migrates only legacy mute and caps legacy volume at 0.32', () => {
    expect(migrateLegacyAudioPreference({
      trackId: 'guqin-liu-shui',
      ambientId: 'forest',
      mainVolume: 0.8,
      mainMuted: true,
    })).toEqual({ trackId: null, volume: 0.32, muted: true });
    expect(migrateLegacyAudioPreference({ mainVolume: 0.18 })).toEqual({ trackId: null, volume: 0.18, muted: false });
  });
});

describe('dual-deck playback helpers', () => {
  it('uses six-second automatic and 1.8-second manual crossfades', () => {
    expect(AUTO_CROSSFADE_MS).toBe(6_000);
    expect(MANUAL_CROSSFADE_MS).toBe(1_800);
  });

  it('calculates equal-power gains at the requested base volume', () => {
    expect(crossfadeGains(0, 0.32)).toEqual({ outgoing: 0.32, incoming: 0 });
    expect(crossfadeGains(0.5, 0.32).outgoing).toBeCloseTo(0.2263, 4);
    expect(crossfadeGains(0.5, 0.32).incoming).toBeCloseTo(0.2263, 4);
    expect(crossfadeGains(1, 0.32).outgoing).toBeCloseTo(0);
    expect(crossfadeGains(1, 0.32).incoming).toBeCloseTo(0.32);
  });

  it('wraps in either direction, skips failures and reports all-track failure', () => {
    expect(nextPlayableTrackId(expectedOrder, expectedOrder[0], new Set(), 1)).toBe(expectedOrder[1]);
    expect(nextPlayableTrackId(expectedOrder, expectedOrder[0], new Set(), -1)).toBe(expectedOrder[5]);
    expect(nextPlayableTrackId(expectedOrder, expectedOrder[0], new Set([expectedOrder[1]]), 1)).toBe(expectedOrder[2]);
    expect(nextPlayableTrackId(expectedOrder, expectedOrder[0], new Set(expectedOrder), 1)).toBeNull();
  });

  it('keeps the louder deck when pausing a transition', () => {
    expect(louderDeck(0.24, 0.12)).toBe(0);
    expect(louderDeck(0.08, 0.2)).toBe(1);
  });
});
