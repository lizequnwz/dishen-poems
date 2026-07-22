export type UiLanguage = 'zh' | 'en';
export type DisplayScript = 'simplified' | 'traditional';

export function normalizeDisplayScript(value: string | null | undefined): DisplayScript {
  return value === 'traditional' ? 'traditional' : 'simplified';
}
