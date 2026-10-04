import { describe, expect, it } from 'vitest';
import { normalizeDisplayScript, normalizeUiLanguage, resolveThemePreference } from '../src/lib/preferences';

describe('theme and language preferences', () => {
  it('keeps an explicit theme regardless of the system theme', () => {
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
  });

  it.each([null, undefined, '', 'auto', 'invalid', true])('uses system theme for invalid saved state %j', (value) => {
    expect(resolveThemePreference(value, true)).toBe('dark');
    expect(resolveThemePreference(value, false)).toBe('light');
  });

  it('only restores the supported English language value', () => {
    expect(normalizeUiLanguage('en')).toBe('en');
    expect(normalizeUiLanguage('zh')).toBe('zh');
    expect(normalizeUiLanguage('invalid')).toBe('zh');
  });
});

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
