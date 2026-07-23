import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ambientPresets,
  audioAssets,
  candidatePlaybackCatalog,
  musicPlaylist,
  validateAudioCatalog,
  type AudioAsset,
} from '../src/lib/audio-data';
import { defaultAudioPreference, normalizeAudioPreference } from '../src/lib/audio-preferences';

const projectRoot = join(import.meta.dirname, '..');

describe('audio catalog approval gate', () => {
  it('keeps every downloaded asset candidate-only until human listening approval', () => {
    expect(audioAssets).toHaveLength(7);
    expect(audioAssets.every((asset) => asset.approvalStatus === 'candidate')).toBe(true);
    expect(candidatePlaybackCatalog().musicIds).toHaveLength(3);
    expect(musicPlaylist.assetIds).toHaveLength(3);
    expect(ambientPresets).toHaveLength(4);
  });

  it('rejects an approved asset without a complete approval record', () => {
    const invalid = {
      ...audioAssets[0],
      approvalStatus: 'approved',
      mp3: { ...audioAssets[0].mp3, path: '/audio/liu-shui.mp3' },
    } as AudioAsset;
    expect(() => validateAudioCatalog([invalid])).toThrow('human approval record');
  });

  it('ships matching MP3 checksums and keeps every file below 25 MiB', () => {
    for (const asset of audioAssets) {
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
      mainMuted: true,
      ambientId: 'forest',
      trackId: 'guqin-liu-shui',
    })).toEqual({
      ...defaultAudioPreference,
      mainVolume: 1,
      ambientVolume: 0,
      mainMuted: true,
      ambientId: 'forest',
      trackId: 'guqin-liu-shui',
    });
  });
});
