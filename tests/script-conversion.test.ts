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

  it('converts shared interface copy at build time', () => {
    const result = deriveTextVariants('关于此数字诗集，查看完整简介。', 'simplified');

    expect(result.simplified).toBe('关于此数字诗集，查看完整简介。');
    expect(result.traditional).toBe('關於此數字詩集，查看完整簡介。');
  });

  it('derives simplified display text from a traditional authoritative source', () => {
    const source = '雲海無處不在。';
    const result = deriveTextVariants(source, 'traditional');

    expect(result.original).toBe(source);
    expect(result.simplified).toBe('云海无处不在。');
    expect(result.traditional).toBe(source);
  });
});
