import { describe, expect, it } from 'vitest';
import { archivePoemAnchor, archiveStateUrl, buildArchiveSearchRecords, readArchiveState, validArchiveReturn, type ArchivePoem } from '../src/lib/archive-search';

const poem: ArchivePoem = {
  body: '雲深山外雨，\n風送故園香。',
  data: { id: 'poem-example', slug: '2026-07-01-example', title: '雲外雨', writtenDate: '2026-07-01', originalScript: 'traditional', status: 'verified' },
};

describe('archive search content boundary', () => {
  it('indexes only one canonical simplified record and keeps both display scripts', () => {
    const records = buildArchiveSearchRecords([poem, { ...poem, data: { ...poem.data, status: 'ingested' } }]);
    expect(records).toHaveLength(1);
    expect(records[0].content).toBe('云外雨\n云深山外雨，\n风送故园香。');
    expect(records[0].language).toBe('zh');
    expect(records[0].meta.titleTraditional).toBe('雲外雨');
    expect(records[0].filters).toEqual({ year: ['2026'] });
    expect(records[0].url).toBe('/poems/2026-07-01-example/');
  });

  it('uses reviewed display overrides without changing the authoritative poem', () => {
    const reviewed = { ...poem, data: { ...poem.data, scriptOverrides: { simplified: { '故园': '故園' }, traditional: {} } } };
    expect(buildArchiveSearchRecords([reviewed])[0].content).toContain('故園');
    expect(reviewed.body).toBe(poem.body);
  });
});

describe('archive navigation state', () => {
  it('round trips Chinese query, year filter and compact view in a shareable URL', () => {
    const initial = new URL('https://example.com/archive/#old-position');
    const state = { query: '雲外雨', year: '2026', view: 'list' as const };
    const url = archiveStateUrl(initial, state);
    expect(readArchiveState(url, ['2026', '2006'])).toEqual(state);
    expect(url.hash).toBe('');
  });

  it('rejects unknown years and retains the year route default', () => {
    expect(readArchiveState(new URL('https://example.com/archive/2006/?year=1900&view=unknown'), ['2026', '2006'], '2006')).toEqual({ query: '', year: '2006', view: 'gallery' });
  });

  it('removes cleared filters and excludes the implicit year from the URL', () => {
    const url = archiveStateUrl(new URL('https://example.com/archive/2006/?q=rain&year=2026&view=list'), { query: '', year: '2006', view: 'gallery' }, '2006');
    expect(url.search).toBe('');
  });

  it('can explicitly search all years from a year page', () => {
    const state = { query: '雨', year: '', view: 'gallery' as const };
    const url = archiveStateUrl(new URL('https://example.com/archive/2006/'), state, '2006');
    expect(url.searchParams.get('year')).toBe('all');
    expect(readArchiveState(url, ['2026', '2006'], '2006')).toEqual(state);
  });

  it('only restores same-origin archive URLs, keeping query and row anchor', () => {
    const url = `/archive/?q=雨#${archivePoemAnchor(poem.data.slug)}`;
    expect(validArchiveReturn(url, 'https://example.com')).toBe('/archive/?q=%E9%9B%A8#archive-poem-2026-07-01-example');
    expect(validArchiveReturn('https://evil.example/archive/', 'https://example.com')).toBeUndefined();
    expect(validArchiveReturn('/preview/pdf/', 'https://example.com')).toBeUndefined();
    expect(validArchiveReturn('javascript:alert(1)', 'https://example.com')).toBeUndefined();
  });
});
