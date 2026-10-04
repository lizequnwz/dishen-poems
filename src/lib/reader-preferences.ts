export type ReadingSize = 'small' | 'standard' | 'large';
export type ReadingView = 'wrap' | 'original';

export const READING_SIZE_STORAGE_KEY = 'dishen-reading-size';
export const READING_VIEW_STORAGE_KEY = 'dishen-reading-view';

export function normalizeReadingSize(value: unknown): ReadingSize {
  return value === 'small' || value === 'large' ? value : 'standard';
}

export function normalizeReadingView(value: unknown): ReadingView {
  return value === 'original' ? 'original' : 'wrap';
}
