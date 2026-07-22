import { describe, expect, it } from 'vitest';
import { deriveTextVariants } from '../src/lib/script-conversion';

describe('deriveTextVariants', () => {
  it('preserves the authoritative original exactly', () => {
    const source = '冰雪退至白云边，\n无处不写（显）好文章。';
    const result = deriveTextVariants(source, 'simplified');

    expect(result.original).toBe(source);
    expect(result.simplified).toBe(source);
    expect(result.traditional).toBe('冰雪退至白雲邊，\n無處不寫（顯）好文章。');
  });

  it('applies reviewed exceptions only to the selected display variant', () => {
    const result = deriveTextVariants('云海', 'simplified', {
      simplified: {},
      traditional: { 雲海: '雲海（例外）' },
    });

    expect(result.original).toBe('云海');
    expect(result.traditional).toBe('雲海（例外）');
  });
});
