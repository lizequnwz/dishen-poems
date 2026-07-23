import { describe, expect, it } from 'vitest';
import { comparePoemsNewestFirst } from '../src/lib/poem-ordering';

type SortablePoem = { data: { id: string; writtenDate: string } };

describe('public poem ordering', () => {
  it('sorts by date descending and id ascending for same-day poems', () => {
    const poems: SortablePoem[] = [
      { data: { id: 'poem-b', writtenDate: '2026-07-01' } },
      { data: { id: 'poem-old', writtenDate: '2025-12-31' } },
      { data: { id: 'poem-a', writtenDate: '2026-07-01' } },
      { data: { id: 'poem-new', writtenDate: '2026-07-02' } },
    ];
    const sorted = poems.sort(comparePoemsNewestFirst as (a: SortablePoem, b: SortablePoem) => number);
    expect(sorted.map((poem) => poem.data.id)).toEqual(['poem-new', 'poem-a', 'poem-b', 'poem-old']);
  });

  it('degrades naturally when fewer than five poems exist', () => {
    const poems: SortablePoem[] = [
      { data: { id: 'poem-one', writtenDate: '2026-01-01' } },
      { data: { id: 'poem-two', writtenDate: '2026-01-02' } },
    ];
    expect(poems.sort(comparePoemsNewestFirst).slice(0, 5)).toHaveLength(2);
  });
});
