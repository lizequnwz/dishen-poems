import { deriveTextVariants, type OriginalScript, type ScriptOverrides } from './script-conversion';

export interface ArchivePoem {
  body?: string;
  data: {
    id: string;
    slug: string;
    title: string;
    writtenDate: string;
    originalScript: OriginalScript;
    status: 'ingested' | 'verified' | 'curated';
    scriptOverrides?: ScriptOverrides;
  };
}

export interface ArchiveSearchRecord {
  url: string;
  content: string;
  language: 'zh';
  meta: Record<string, string>;
  filters: { year: string[] };
  sort: { date: string };
}

/** One canonical record per public poem; display variants never become duplicate results. */
export function buildArchiveSearchRecords(poems: ArchivePoem[]): ArchiveSearchRecord[] {
  return poems.filter((poem) => poem.data.status !== 'ingested').map((poem) => {
    const { data } = poem;
    const title = deriveTextVariants(data.title, data.originalScript);
    const body = deriveTextVariants(poem.body ?? '', data.originalScript, data.scriptOverrides);
    return {
      url: `/poems/${data.slug}/`,
      content: `${title.simplified}\n${body.simplified}`,
      language: 'zh',
      meta: {
        title: title.simplified,
        titleTraditional: title.traditional,
        writtenDate: data.writtenDate,
        excerpt: body.simplified.split('\n').find((line) => line.trim()) ?? '',
        excerptTraditional: body.traditional.split('\n').find((line) => line.trim()) ?? '',
      },
      filters: { year: [data.writtenDate.slice(0, 4)] },
      sort: { date: data.writtenDate },
    };
  });
}

export { archivePoemAnchor, archiveStateUrl, readArchiveState, validArchiveReturn } from './archive-navigation';
export type { ArchiveState } from './archive-navigation';
