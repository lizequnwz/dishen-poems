import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const expectedBodies: Record<string, string> = {
  '2026-04-19-春憩.md': '冰雪退至白云边，\n只见花丛不见山；\n细闻鸟鸣观蝶舞，\n已思桂香入息鼾。',
  '2026-04-20-高山春.md': '雨一场，雪一场，雨雪花飘绿中赏，这个美，好难忘！\n风一场，香一场，万花迎风暖中扬，这个春，真风光！\n太阳自非闲，日光风云交替袭，间或照，送花香，沁脾，爽！\n短袖衣，踩香梁，君去也，刹印扔在山路上，留与夜中群星眨眼赏，僧之物，大吉祥！',
  '2026-05-31-奇雨.md': '雨卷斜阳走空山，\n泼洒彩虹随雷迁；\n哗哗如泻携风住，\n环然周变舞云端。',
  '2026-05-12-一日四季.md': '松鼠云海正夏游，\n忽炸雷电降枝头；\n狂风暴雪埋万径，\n界事梦中难可求，\n短衣知薄激灵扣，\n飞奔回急小命留；\n生灵冷暖尽皆明，\n难得一日夏冬秋！',
  '2026-01-11-风雪润笔.md': '寒风绯脸眉结霜，\n紧裹棉衣手却僵。\n狂风暴雪真金笔，\n无处不写（显）好文章。',
};

function markdownBody(filename: string) {
  const source = readFileSync(resolve('poems', filename), 'utf8');
  const sections = source.split('---');
  return sections.slice(2).join('---').trim();
}

describe('authoritative poem files', () => {
  for (const [filename, body] of Object.entries(expectedBodies)) {
    it(`preserves ${filename}`, () => {
      expect(markdownBody(filename)).toBe(body);
    });
  }
});
