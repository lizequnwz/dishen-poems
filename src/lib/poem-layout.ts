export type PoemLineTier = 'standard' | 'compact' | 'long';

export function poemSourceLines(body: string): string[] {
  return body.split(/\r?\n/);
}

export function longestPoemLineLength(body: string): number {
  return poemSourceLines(body)
    .reduce((longest, line) => Math.max(longest, Array.from(line.trim()).length), 0);
}

export function poemLineTier(body: string): PoemLineTier {
  const longestLine = longestPoemLineLength(body);
  if (longestLine > 24) return 'long';
  if (longestLine > 14) return 'compact';
  return 'standard';
}
