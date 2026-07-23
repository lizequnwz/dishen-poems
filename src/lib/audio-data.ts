import assetRecords from '../data/audio-assets.json';
import playlistRecord from '../data/audio-playlists.json';

export interface AudioAsset {
  id: string;
  role: 'music' | 'ambient' | 'accent';
  family?: AccentPreset['id'];
  title: { zh: string; en: string };
  creator: string;
  sourcePage: string;
  originalFile: string;
  license: { name: string; url: string; attributionRequired: boolean };
  retrievedAt: string;
  mp3: { path: string; localFile: string; bytes: number; sha256: string; transcode: string };
  approvalStatus: 'candidate' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
  review: {
    licenseMetadata: 'checked' | 'pending';
    fileSize: 'checked' | 'pending';
    noise: string;
    loudness: string;
    loopSeam: string;
    listening: 'approved' | 'rejected' | 'pending';
  };
}

export interface MusicPlaylist {
  id: string;
  assetIds: string[];
  repeat: 'all';
}

export interface AmbientPreset {
  id: 'rain' | 'stream' | 'forest' | 'birds';
  assetId: string;
}

export interface AccentPreset {
  id: 'flute' | 'bowl' | 'chimes';
  title: { zh: string; en: string };
  assetIds: string[];
}

export type AccentMode = 'off' | 'mixed' | AccentPreset['id'];

export interface AudioPreference {
  mainVolume: number;
  ambientVolume: number;
  accentVolume: number;
  mainMuted: boolean;
  ambientMuted: boolean;
  accentMuted: boolean;
  trackId: string | null;
  ambientId: AmbientPreset['id'] | null;
  accentMode: AccentMode;
}

export const audioAssets = assetRecords as AudioAsset[];
export const musicPlaylist = playlistRecord.music as MusicPlaylist;
export const ambientPresets = playlistRecord.ambient as AmbientPreset[];
export const accentPresets = playlistRecord.accent as AccentPreset[];

export function validateAudioCatalog(assets: AudioAsset[] = audioAssets) {
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`[audio] Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    if (!asset.sourcePage || !asset.creator || !asset.license.name || !asset.license.url) {
      throw new Error(`[audio] Incomplete license metadata: ${asset.id}`);
    }
    if (!asset.mp3.path.endsWith('.mp3')) throw new Error(`[audio] Only MP3 assets are deployable: ${asset.id}`);
    if (asset.approvalStatus === 'candidate' && !asset.mp3.path.startsWith('/preview/audio/assets/')) {
      throw new Error(`[audio] Candidate asset must use the development-only preview route: ${asset.id}`);
    }
    if (asset.mp3.bytes >= 25 * 1024 * 1024) throw new Error(`[audio] Asset exceeds 25 MiB: ${asset.id}`);
    if (!/^[a-f0-9]{64}$/.test(asset.mp3.sha256)) throw new Error(`[audio] Invalid checksum: ${asset.id}`);
    if (asset.approvalStatus === 'approved') {
      if (!asset.mp3.path.startsWith('/audio/') || asset.mp3.path.includes('/candidates/')) {
        throw new Error(`[audio] Approved asset must be promoted to a public audio path: ${asset.id}`);
      }
      if (asset.review.listening !== 'approved' || !asset.approvedAt || !asset.approvedBy) {
        throw new Error(`[audio] Approved asset lacks a complete human approval record: ${asset.id}`);
      }
    }
    if (asset.role === 'accent' && !asset.family) {
      throw new Error(`[audio] Accent asset lacks a family: ${asset.id}`);
    }
  }
  for (const id of musicPlaylist.assetIds) {
    if (!ids.has(id)) throw new Error(`[audio] Playlist references missing asset: ${id}`);
  }
  for (const preset of ambientPresets) {
    if (!ids.has(preset.assetId)) throw new Error(`[audio] Ambient preset references missing asset: ${preset.assetId}`);
  }
  for (const preset of accentPresets) {
    if (preset.assetIds.length === 0) throw new Error(`[audio] Accent preset is empty: ${preset.id}`);
    for (const id of preset.assetIds) {
      const asset = assets.find((item) => item.id === id);
      if (!asset) throw new Error(`[audio] Accent preset references missing asset: ${id}`);
      if (asset.role !== 'accent' || asset.family !== preset.id) {
        throw new Error(`[audio] Accent preset family mismatch: ${id}`);
      }
    }
  }
}

validateAudioCatalog();

export const approvedAudioAssets = audioAssets.filter((asset) => asset.approvalStatus === 'approved');
export const candidateAudioAssets = audioAssets.filter((asset) => asset.approvalStatus === 'candidate');

export function approvedPlaybackCatalog() {
  const approvedIds = new Set(approvedAudioAssets.map((asset) => asset.id));
  return {
    assets: approvedAudioAssets,
    musicIds: musicPlaylist.assetIds.filter((id) => approvedIds.has(id)),
    ambient: ambientPresets.filter((preset) => approvedIds.has(preset.assetId)),
    accent: accentPresets
      .map((preset) => ({ ...preset, assetIds: preset.assetIds.filter((id) => approvedIds.has(id)) }))
      .filter((preset) => preset.assetIds.length > 0),
  };
}

export function candidatePlaybackCatalog() {
  const candidateIds = new Set(candidateAudioAssets.map((asset) => asset.id));
  return {
    assets: candidateAudioAssets,
    musicIds: musicPlaylist.assetIds.filter((id) => candidateIds.has(id)),
    ambient: ambientPresets.filter((preset) => candidateIds.has(preset.assetId)),
    accent: accentPresets
      .map((preset) => ({ ...preset, assetIds: preset.assetIds.filter((id) => candidateIds.has(id)) }))
      .filter((preset) => preset.assetIds.length > 0),
  };
}
