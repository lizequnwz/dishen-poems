import { describe, expect, it } from 'vitest';
import {
  clearReadingHistory,
  markLastRead,
  normalizeReadingLibrary,
  readReadingLibrary,
  READING_LIBRARY_STORAGE_KEY,
  toggleSavedPoem,
  writeReadingLibrary,
} from '../src/lib/reading-library';

const ids = new Set(['stable-one', 'stable-two', 'stable-three']);

describe('local reading library', () => {
  it('filters unpublished or removed IDs, rejects malformed values, and removes duplicates without changing order', () => {
    expect(normalizeReadingLibrary({ savedIds: ['stable-two', 'deleted', 'stable-one', 'stable-two', 7, null], lastReadId: 'deleted' }, ids))
      .toEqual({ savedIds: ['stable-two', 'stable-one'], lastReadId: null });
    expect(normalizeReadingLibrary({ savedIds: 'stable-one', lastReadId: {} }, ids)).toEqual({ savedIds: [], lastReadId: null });
    expect(normalizeReadingLibrary(null, ids)).toEqual({ savedIds: [], lastReadId: null });
  });

  it('adds newest saves first and removes an existing save without mutating the input', () => {
    const initial = { savedIds: ['stable-one'], lastReadId: 'stable-two' };
    expect(toggleSavedPoem(initial, 'stable-three', ids)).toEqual({ savedIds: ['stable-three', 'stable-one'], lastReadId: 'stable-two' });
    expect(toggleSavedPoem(initial, 'stable-one', ids)).toEqual({ savedIds: [], lastReadId: 'stable-two' });
    expect(initial).toEqual({ savedIds: ['stable-one'], lastReadId: 'stable-two' });
    expect(toggleSavedPoem(initial, 'not-public', ids)).toEqual(initial);
  });

  it('records only public IDs and clears reading history independently of saves', () => {
    const initial = { savedIds: ['stable-one'], lastReadId: null };
    expect(markLastRead(initial, 'stable-three', ids)).toEqual({ savedIds: ['stable-one'], lastReadId: 'stable-three' });
    expect(markLastRead(initial, 'not-public', ids)).toEqual(initial);
    expect(clearReadingHistory({ ...initial, lastReadId: 'stable-two' })).toEqual(initial);
  });

  it('restores stable IDs after title or URL revisions because metadata is never stored', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(writeReadingLibrary(storage, { savedIds: ['stable-one'], lastReadId: 'stable-two' }, ids)).toBe(true);
    expect(JSON.parse(values.get(READING_LIBRARY_STORAGE_KEY)!)).toEqual({ savedIds: ['stable-one'], lastReadId: 'stable-two' });
    expect(readReadingLibrary(storage, ids)).toEqual({ state: { savedIds: ['stable-one'], lastReadId: 'stable-two' }, available: true });
  });

  it('recovers corrupt saved JSON and exposes blocked reads or writes without throwing', () => {
    expect(readReadingLibrary({ getItem: () => '{bad' }, ids)).toEqual({ state: { savedIds: [], lastReadId: null }, available: true });
    expect(readReadingLibrary({ getItem: () => { throw new Error('blocked'); } }, ids)).toEqual({ state: { savedIds: [], lastReadId: null }, available: false });
    expect(writeReadingLibrary({ setItem: () => { throw new Error('quota'); } }, { savedIds: ['stable-one'], lastReadId: null }, ids)).toBe(false);
  });

  it('writes only catalog IDs even if the proposed state contains stale records', () => {
    let saved = '';
    expect(writeReadingLibrary({ setItem: (_key, value) => { saved = value; } }, { savedIds: ['deleted', 'stable-one'], lastReadId: 'deleted' }, ids)).toBe(true);
    expect(JSON.parse(saved)).toEqual({ savedIds: ['stable-one'], lastReadId: null });
  });
});
