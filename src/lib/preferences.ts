export type UiLanguage = 'zh' | 'en';
export type DisplayScript = 'simplified' | 'traditional';
export type Theme = 'light' | 'dark';

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === 'en' ? 'en' : 'zh';
}

export function resolveThemePreference(value: unknown, prefersDark: boolean): Theme {
  if (value === 'light' || value === 'dark') return value;
  return prefersDark ? 'dark' : 'light';
}

export function normalizeDisplayScript(value: string | null | undefined): DisplayScript {
  return value === 'traditional' ? 'traditional' : 'simplified';
}
