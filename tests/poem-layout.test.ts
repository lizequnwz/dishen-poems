import { describe, expect, it } from 'vitest';
import { longestPoemLineLength, poemLineTier, poemSourceLines } from '../src/lib/poem-layout';

describe('poem line layout', () => {
  it('counts Unicode code points in the longest trimmed source line', () => {
    expect(longestPoemLineLength('  山河\n明月照高楼  ')).toBe(5);
    expect(longestPoemLineLength('一𠀀二\n短')).toBe(3);
    expect(longestPoemLineLength('')).toBe(0);
  });

  it('preserves source line boundaries, including intentional empty lines', () => {
    expect(poemSourceLines('第一行\n\n第三行\r\n第四行')).toEqual(['第一行', '', '第三行', '第四行']);
  });

  it('selects deterministic typography tiers at the boundaries', () => {
    expect(poemLineTier('一'.repeat(14))).toBe('standard');
    expect(poemLineTier('一'.repeat(15))).toBe('compact');
    expect(poemLineTier('一'.repeat(24))).toBe('compact');
    expect(poemLineTier('一'.repeat(25))).toBe('long');
  });

  it('uses the longest line rather than total poem length', () => {
    const manyShortLines = Array.from({ length: 30 }, () => '四字诗行').join('\n');
    expect(poemLineTier(manyShortLines)).toBe('standard');
  });
});
