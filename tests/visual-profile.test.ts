import { describe, expect, it } from 'vitest';
import { detectVisualSignals, resolveVisualProfile } from '../src/lib/visual-profile';

describe('visual profile resolution', () => {
  it('keeps lexical signals internal and deterministic', () => {
    const input = {
      id: 'poem-20260531-qi-yu',
      writtenDate: '2026-05-31',
      title: '奇雨',
      body: '雨卷斜阳走空山，\n泼洒彩虹随雷迁；',
    };
    expect(resolveVisualProfile(input)).toEqual(resolveVisualProfile(input));
    expect(detectVisualSignals(input.body).motifs).toEqual(['mountain', 'rain', 'sun', 'lightning']);
  });

  it('honors curated fields while filling omitted fields', () => {
    const profile = resolveVisualProfile({
      id: 'poem-20260419-chun-qi',
      writtenDate: '2026-04-19',
      title: '春憩',
      body: '冰雪退至白云边',
      profile: { composition: 'open-right', motifs: ['flora', 'snow'] },
    });
    expect(profile.composition).toBe('open-right');
    expect(profile.motifs).toEqual(['flora', 'snow']);
    expect(profile.palette).toBe('spring');
  });

  it('can express all five composition families distinctly', () => {
    const compositions = ['open-left', 'open-right', 'vertical-ridge', 'split-field', 'diagonal-flow'] as const;
    const resolved = compositions.map((composition, index) =>
      resolveVisualProfile({
        id: `poem-2026010${index + 1}-sample`,
        writtenDate: `2026-01-0${index + 1}`,
        title: '示例',
        body: '示例正文',
        profile: { composition },
      }).composition,
    );
    expect(new Set(resolved).size).toBe(5);
  });
});
