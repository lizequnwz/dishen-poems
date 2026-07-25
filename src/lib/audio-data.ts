import assetRecords from '../data/audio-assets.json';
import playlistRecord from '../data/audio-playlists.json';

export type SoundscapeTheme = 'morning-mist' | 'sea-of-clouds' | 'still-waters';

export interface AudioSource {
  title: string;
  creator: string;
  sourcePage: string;
  originalFile: string;
  license: { name: string; url: string; attributionRequired: boolean };
  retrievedAt: string;
}

export interface AudioAsset {
  id: string;
  role: 'soundscape';
  theme: SoundscapeTheme;
  variant: 1 | 2;
  displayTitle: { zh: string; en: string };
  sources: AudioSource[];
  mp3: { path: string; localFile: string; bytes: number; sha256: string; transcode: string };
  approvalStatus: 'candidate' | 'approved' | 'rejected';
  approvedAt?: string;
  approvedBy?: string;
  review: {
    licenseMetadata: 'checked' | 'pending';
    fileSize: 'checked' | 'pending';
    decode: 'passed' | 'pending' | 'failed';
    noise: string;
    loudness: string;
    listening: 'approved' | 'rejected' | 'pending';
  };
}

export interface SoundscapePlaylist {
  id: string;
  assetIds: string[];
  repeat: 'all';
}

export interface AudioPreference {
  trackId: string | null;
  volume: number;
  muted: boolean;
}

export interface PlaybackCatalog {
  assets: AudioAsset[];
  trackIds: string[];
}

export const audioAssets = assetRecords as AudioAsset[];
export const soundscapePlaylist = playlistRecord.soundscape as SoundscapePlaylist;

const allowedLicenseUrls = new Set([
  'https://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/publicdomain/mark/1.0/',
]);

export function validateAudioCatalog(assets: AudioAsset[] = audioAssets) {
  const ids = new Set<string>();
  const themeVariants = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) throw new Error(`[audio] Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    const themeVariant = `${asset.theme}:${asset.variant}`;
    if (themeVariants.has(themeVariant)) throw new Error(`[audio] Duplicate theme variant: ${themeVariant}`);
    themeVariants.add(themeVariant);
    if (asset.sources.length === 0) throw new Error(`[audio] Soundscape lacks sources: ${asset.id}`);
    for (const source of asset.sources) {
      if (!source.title || !source.creator || !source.sourcePage || !source.originalFile || !source.retrievedAt) {
        throw new Error(`[audio] Incomplete source metadata: ${asset.id}`);
      }
      if (!allowedLicenseUrls.has(source.license.url)) {
        throw new Error(`[audio] Unsupported source license: ${asset.id}`);
      }
    }
    if (!asset.mp3.path.endsWith('.mp3')) throw new Error(`[audio] Only MP3 assets are deployable: ${asset.id}`);
    if (asset.approvalStatus === 'candidate' && !asset.mp3.path.startsWith('/preview/audio/assets/')) {
      throw new Error(`[audio] Candidate asset must use the development-only preview route: ${asset.id}`);
    }
    if (asset.mp3.bytes >= 12 * 1024 * 1024) throw new Error(`[audio] Asset exceeds 12 MiB: ${asset.id}`);
    if (!/^[a-f0-9]{64}$/.test(asset.mp3.sha256)) throw new Error(`[audio] Invalid checksum: ${asset.id}`);
    if (asset.approvalStatus === 'approved') {
      if (!asset.mp3.path.startsWith('/audio/') || asset.mp3.path.includes('/candidates/')) {
        throw new Error(`[audio] Approved asset must use a public audio path: ${asset.id}`);
      }
      if (asset.review.listening !== 'approved' || asset.review.decode !== 'passed' || !asset.approvedAt || !asset.approvedBy) {
        throw new Error(`[audio] Approved asset lacks a complete approval record: ${asset.id}`);
      }
    }
  }
  for (const id of soundscapePlaylist.assetIds) {
    if (!ids.has(id)) throw new Error(`[audio] Playlist references missing asset: ${id}`);
  }
}

validateAudioCatalog();

export const approvedAudioAssets = audioAssets.filter((asset) => asset.approvalStatus === 'approved');
export const candidateAudioAssets = audioAssets.filter((asset) => asset.approvalStatus === 'candidate');

export function approvedPlaybackCatalog(): PlaybackCatalog {
  const approvedIds = new Set(approvedAudioAssets.map((asset) => asset.id));
  return {
    assets: approvedAudioAssets,
    trackIds: soundscapePlaylist.assetIds.filter((id) => approvedIds.has(id)),
  };
}

export function candidatePlaybackCatalog(): PlaybackCatalog {
  return {
    assets: candidateAudioAssets,
    trackIds: candidateAudioAssets.map((asset) => asset.id),
  };
}
