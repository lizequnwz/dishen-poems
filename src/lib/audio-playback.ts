export const MAIN_DUCK_MULTIPLIER = 0.45;
export const AMBIENT_DUCK_MULTIPLIER = 0.71;
export const DUCK_ATTACK_MS = 600;
export const DUCK_RELEASE_MS = 1_800;
export const ACCENT_DUCK_DELAY_MS = 180;

export function clampUnit(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function effectiveVolume(baseVolume: number, multiplier = 1) {
  return clampUnit(clampUnit(baseVolume) * Math.max(0, multiplier));
}

export function accentDelayMs(first: boolean, randomValue = Math.random()) {
  const bounded = clampUnit(randomValue);
  const [minimum, maximum] = first ? [45_000, 90_000] : [120_000, 240_000];
  return Math.round(minimum + (maximum - minimum) * bounded);
}

export function chooseAccentId(
  ids: string[],
  failedIds: ReadonlySet<string>,
  previousId: string | null,
  randomValue = Math.random(),
) {
  const available = ids.filter((id) => !failedIds.has(id));
  if (available.length === 0) return null;
  const withoutRepeat = available.length > 1 ? available.filter((id) => id !== previousId) : available;
  return withoutRepeat[Math.min(withoutRepeat.length - 1, Math.floor(clampUnit(randomValue) * withoutRepeat.length))];
}
