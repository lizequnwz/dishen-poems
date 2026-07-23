import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ambientPresets,
  accentPresets,
  approvedAudioAssets,
  approvedPlaybackCatalog,
  audioAssets,
  candidatePlaybackCatalog,
  musicPlaylist,
  validateAudioCatalog,
  type AudioAsset,
} from '../src/lib/audio-data';
import {
  AMBIENT_DUCK_MULTIPLIER,
  MAIN_DUCK_MULTIPLIER,
  accentDelayMs,
  chooseAccentId,
  effectiveVolume,
} from '../src/lib/audio-playback';
import {
  defaultAudioPreference,
  normalizeAudioPanelExpanded,
  normalizeAudioPreference,
} from '../src/lib/audio-preferences';

const projectRoot = join(import.meta.dirname, '..');

describe('audio catalog approval gate', () => {
  it('keeps the original seven candidates separate from the seven owner-approved additions', () => {
    expect(audioAssets).toHaveLength(14);
    expect(audioAssets.filter((asset) => asset.approvalStatus === 'candidate')).toHaveLength(7);
    expect(approvedAudioAssets).toHaveLength(7);
    expect(candidatePlaybackCatalog().musicIds).toHaveLength(3);
    expect(approvedPlaybackCatalog().musicIds).toHaveLength(2);
    expect(approvedPlaybackCatalog().accent).toHaveLength(3);
    expect(musicPlaylist.assetIds).toHaveLength(5);
    expect(ambientPresets).toHaveLength(4);
    expect(accentPresets).toHaveLength(3);
  });

  it('rejects an approved asset without a complete approval record', () => {
    const invalid = {
      ...audioAssets[0],
      approvalStatus: 'approved',
      mp3: { ...audioAssets[0].mp3, path: '/audio/liu-shui.mp3' },
    } as AudioAsset;
    expect(() => validateAudioCatalog([invalid])).toThrow('human approval record');
  });

  it('ships matching approved MP3 checksums and keeps every public file below 25 MiB', () => {
    for (const asset of approvedAudioAssets) {
      const path = join(projectRoot, asset.mp3.localFile);
      const bytes = statSync(path).size;
      const checksum = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(bytes).toBe(asset.mp3.bytes);
      expect(bytes).toBeLessThan(25 * 1024 * 1024);
      expect(checksum).toBe(asset.mp3.sha256);
    }
  });
});

describe('audio preferences', () => {
  it('restores selections and levels but does not contain a playback state', () => {
    expect(normalizeAudioPreference({
      mainVolume: 3,
      ambientVolume: -1,
      accentVolume: 0.3,
      mainMuted: true,
      accentMuted: true,
      ambientId: 'forest',
      accentMode: 'bowl',
      trackId: 'guqin-liu-shui',
    })).toEqual({
      ...defaultAudioPreference,
      mainVolume: 1,
      ambientVolume: 0,
      mainMuted: true,
      accentMuted: true,
      ambientId: 'forest',
      accentMode: 'bowl',
      trackId: 'guqin-liu-shui',
    });
  });

  it('migrates two-layer preferences with accents safely disabled', () => {
    expect(normalizeAudioPreference({ mainVolume: 0.4, ambientVolume: 0.2 })).toEqual({
      ...defaultAudioPreference,
      mainVolume: 0.4,
      ambientVolume: 0.2,
    });
  });

  it('restores only an explicit expanded panel preference', () => {
    expect(normalizeAudioPanelExpanded(true)).toBe(true);
    expect(normalizeAudioPanelExpanded(false)).toBe(false);
    expect(normalizeAudioPanelExpanded('true')).toBe(false);
    expect(normalizeAudioPanelExpanded({ expanded: true })).toBe(false);
    expect(normalizeAudioPanelExpanded(null)).toBe(false);
  });
});

describe('accent scheduling and ducking', () => {
  it('uses bounded first and subsequent scheduling windows', () => {
    expect(accentDelayMs(true, 0)).toBe(45_000);
    expect(accentDelayMs(true, 1)).toBe(90_000);
    expect(accentDelayMs(false, 0)).toBe(120_000);
    expect(accentDelayMs(false, 1)).toBe(240_000);
  });

  it('does not immediately repeat an accent when another choice exists', () => {
    expect(chooseAccentId(['a', 'b'], new Set(), 'a', 0)).toBe('b');
    expect(chooseAccentId(['a', 'b'], new Set(['b']), 'a', 0)).toBe('a');
    expect(chooseAccentId(['a'], new Set(['a']), null, 0)).toBeNull();
  });

  it('applies clamped role-specific duck multipliers', () => {
    expect(effectiveVolume(0.8, MAIN_DUCK_MULTIPLIER)).toBeCloseTo(0.36);
    expect(effectiveVolume(0.8, AMBIENT_DUCK_MULTIPLIER)).toBeCloseTo(0.568);
    expect(effectiveVolume(3, 2)).toBe(1);
    expect(effectiveVolume(-1, 0.5)).toBe(0);
  });
});
