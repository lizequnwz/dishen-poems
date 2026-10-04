import { describe, expect, it } from 'vitest';
import { normalizeReadingSize, normalizeReadingView } from '../src/lib/reader-preferences';

describe('reading preferences', () => {
  it.each(['small', 'standard', 'large'] as const)('restores the saved %s text size', (size) => {
    expect(normalizeReadingSize(size)).toBe(size);
  });

  it.each([null, undefined, '', 'huge', 2, {}, ['large']])('uses comfortable text size for invalid stored state %j', (value) => {
    expect(normalizeReadingSize(value)).toBe('standard');
  });

  it('restores original lines only when explicitly selected', () => {
    expect(normalizeReadingView('original')).toBe('original');
    expect(normalizeReadingView('wrap')).toBe('wrap');
  });

  it.each([null, undefined, '', 'nowrap', true, {}, ['original']])('defaults invalid stored view %j to fit screen', (value) => {
    expect(normalizeReadingView(value)).toBe('wrap');
  });
});
