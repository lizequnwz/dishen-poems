export const AUTO_CROSSFADE_MS = 6_000;
export const MANUAL_CROSSFADE_MS = 1_800;

export function clampUnit(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function crossfadeGains(progress: number, volume: number) {
  const phase = clampUnit(progress) * Math.PI / 2;
  const base = clampUnit(volume);
  return {
    outgoing: base * Math.cos(phase),
    incoming: base * Math.sin(phase),
  };
}

export function nextPlayableTrackId(
  trackIds: readonly string[],
  currentId: string | null,
  failedIds: ReadonlySet<string>,
  direction: 1 | -1 = 1,
) {
  if (trackIds.length === 0 || failedIds.size >= trackIds.length) return null;
  const current = Math.max(0, trackIds.indexOf(currentId ?? ''));
  for (let offset = 1; offset <= trackIds.length; offset += 1) {
    const index = (current + direction * offset + trackIds.length) % trackIds.length;
    if (!failedIds.has(trackIds[index])) return trackIds[index];
  }
  return null;
}

export function louderDeck(firstVolume: number, secondVolume: number): 0 | 1 {
  return secondVolume > firstVolume ? 1 : 0;
}
