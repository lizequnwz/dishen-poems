import { describe, expect, it } from 'vitest';
import { poemSourceLines } from '../src/lib/poem-layout';

describe('poem line layout', () => {
  it('preserves source line boundaries, including intentional empty lines', () => {
    expect(poemSourceLines('第一行\n\n第三行\r\n第四行')).toEqual(['第一行', '', '第三行', '第四行']);
  });

  it('keeps original spacing, punctuation and unusual characters intact', () => {
    expect(poemSourceLines('  一𠀀二，三。  \n\t明月　清風\n')).toEqual(['  一𠀀二，三。  ', '\t明月　清風', '']);
  });
});
