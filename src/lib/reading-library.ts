export const READING_LIBRARY_STORAGE_KEY = 'dishen-reading-library';

export interface ReadingLibraryState {
  savedIds: string[];
  lastReadId: string | null;
}

export interface ReadingCatalogEntry {
  id: string;
  url: string;
  writtenDate: string;
  title: { simplified: string; traditional: string };
}

export function normalizeReadingLibrary(value: unknown, catalogIds: ReadonlySet<string>): ReadingLibraryState {
  const candidate = value && typeof value === 'object' ? value as Partial<ReadingLibraryState> : {};
  return {
    savedIds: Array.isArray(candidate.savedIds)
      ? [...new Set(candidate.savedIds.filter((id): id is string => typeof id === 'string' && catalogIds.has(id)))]
      : [],
    lastReadId: typeof candidate.lastReadId === 'string' && catalogIds.has(candidate.lastReadId) ? candidate.lastReadId : null,
  };
}

export function toggleSavedPoem(state: ReadingLibraryState, id: string, catalogIds: ReadonlySet<string>): ReadingLibraryState {
  const valid = normalizeReadingLibrary(state, catalogIds);
  if (!catalogIds.has(id)) return valid;
  return {
    ...valid,
    savedIds: valid.savedIds.includes(id) ? valid.savedIds.filter((savedId) => savedId !== id) : [id, ...valid.savedIds],
  };
}

export function markLastRead(state: ReadingLibraryState, id: string, catalogIds: ReadonlySet<string>): ReadingLibraryState {
  const valid = normalizeReadingLibrary(state, catalogIds);
  return catalogIds.has(id) ? { ...valid, lastReadId: id } : valid;
}

export function clearReadingHistory(state: ReadingLibraryState): ReadingLibraryState {
  return { ...state, lastReadId: null };
}

export function readReadingLibrary(storage: Pick<Storage, 'getItem'>, catalogIds: ReadonlySet<string>): { state: ReadingLibraryState; available: boolean } {
  let saved: string | null;
  try {
    saved = storage.getItem(READING_LIBRARY_STORAGE_KEY);
  } catch {
    return { state: normalizeReadingLibrary(null, catalogIds), available: false };
  }
  try {
    return { state: normalizeReadingLibrary(saved ? JSON.parse(saved) : null, catalogIds), available: true };
  } catch {
    return { state: normalizeReadingLibrary(null, catalogIds), available: true };
  }
}

export function writeReadingLibrary(storage: Pick<Storage, 'setItem'>, state: ReadingLibraryState, catalogIds: ReadonlySet<string>): boolean {
  try {
    storage.setItem(READING_LIBRARY_STORAGE_KEY, JSON.stringify(normalizeReadingLibrary(state, catalogIds)));
    return true;
  } catch {
    return false;
  }
}
