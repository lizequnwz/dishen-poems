import { describe, expect, it } from 'vitest';
import { normalizeDisplayScript } from '../src/lib/preferences';

describe('normalizeDisplayScript', () => {
  it('preserves a saved simplified preference', () => {
    expect(normalizeDisplayScript('simplified')).toBe('simplified');
  });

  it('preserves a saved traditional preference', () => {
    expect(normalizeDisplayScript('traditional')).toBe('traditional');
  });

  it.each([undefined, null, '', 'original', 'invalid'])('defaults %s to simplified', (value) => {
    expect(normalizeDisplayScript(value)).toBe('simplified');
  });
});
