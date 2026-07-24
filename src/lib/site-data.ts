import { getCollection, type CollectionEntry } from 'astro:content';
import { validateSiteRecords, type RuleReviewDecision } from './content-rules';
import { deriveTextVariants, type TextVariant } from './script-conversion';
import { resolveVisualProfile } from './visual-profile';
import { comparePoemsNewestFirst } from './poem-ordering';
import pdfReviewDecisionData from '../../imports/pdf-review-decisions.json';

export { comparePoemsNewestFirst } from './poem-ordering';

export type PoemEntry = CollectionEntry<'poems'>;
export type ExhibitionEntry = CollectionEntry<'exhibitions'>;
function normalizeBody(body?: string) {
  return (body ?? '').replace(/\r\n/g, '\n').trim();
}

export function getPoemVariants(poem: PoemEntry): Record<TextVariant, string> {
  return deriveTextVariants(normalizeBody(poem.body), poem.data.originalScript, poem.data.scriptOverrides);
}

export function poemPath(poem: PoemEntry) {
  return `/poems/${poem.data.slug}/`;
}

export function getResolvedVisualProfile(poem: PoemEntry) {
  return resolveVisualProfile({
    id: poem.data.id,
    writtenDate: poem.data.writtenDate,
    title: poem.data.title,
    body: normalizeBody(poem.body),
    profile: poem.data.visualProfile,
  });
}

export function formatWrittenDate(date: string, locale: 'zh' | 'en' = 'zh') {
  const [year, month, day] = date.split('-').map(Number);
  if (locale === 'zh') return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export async function loadSiteData() {
  const [poems, exhibitions] = await Promise.all([
    getCollection('poems'),
    getCollection('exhibitions'),
  ]);

  validateSiteRecords(
    poems.map((poem) => ({
      id: poem.data.id,
      slug: poem.data.slug,
      status: poem.data.status,
      source: poem.data.source,
    })),
    exhibitions.map((exhibition) => ({
      id: exhibition.data.id,
      status: exhibition.data.status,
      poemIds: exhibition.data.poemIds,
    })),
    Object.values(pdfReviewDecisionData.decisions) as RuleReviewDecision[],
  );

  const poemById = new Map(poems.map((poem) => [poem.data.id, poem]));
  const currentExhibition = exhibitions.find((exhibition) => exhibition.data.status === 'published')!;
  const currentPoems = currentExhibition.data.poemIds.map((id) => poemById.get(id)!);
  const publicPoems = poems
    .filter((poem) => poem.data.status !== 'ingested')
    .sort(comparePoemsNewestFirst);
  const latestPoems = publicPoems.slice(0, 5);
  const years = [...new Set(publicPoems.map((poem) => poem.data.writtenDate.slice(0, 4)))];

  return {
    poems,
    exhibitions,
    poemById,
    publicPoems,
    latestPoems,
    currentExhibition,
    currentPoems,
    years,
  };
}

export async function loadDraftExhibition(id: string) {
  const data = await loadSiteData();
  const exhibition = data.exhibitions.find(
    (entry) => entry.data.id === id && entry.data.status === 'draft',
  );
  if (!exhibition) return undefined;
  return {
    exhibition,
    poems: exhibition.data.poemIds.map((poemId) => data.poemById.get(poemId)!),
  };
}
