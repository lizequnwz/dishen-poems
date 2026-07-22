export type RulePoem = {
  id: string;
  slug: string;
  status: 'ingested' | 'verified' | 'curated';
};

export type RuleExhibition = {
  id: string;
  status: 'draft' | 'published' | 'archived';
  poemIds: string[];
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[content] ${message}`);
}

function unique<T>(values: T[]) {
  return new Set(values).size === values.length;
}

export function validateSiteRecords(poems: RulePoem[], exhibitions: RuleExhibition[]) {
  invariant(unique(poems.map((poem) => poem.id)), 'Poem ids must be unique.');
  invariant(unique(poems.map((poem) => poem.slug)), 'Poem slugs must be unique.');
  invariant(unique(exhibitions.map((exhibition) => exhibition.id)), 'Exhibition ids must be unique.');

  const poemById = new Map(poems.map((poem) => [poem.id, poem]));

  for (const exhibition of exhibitions) {
    invariant(unique(exhibition.poemIds), `Exhibition "${exhibition.id}" contains duplicate poem ids.`);
    for (const id of exhibition.poemIds) {
      const poem = poemById.get(id);
      invariant(poem, `Exhibition "${exhibition.id}" references missing poem "${id}".`);
      invariant(
        poem.status !== 'ingested',
        `Exhibition "${exhibition.id}" cannot include unverified poem "${id}".`,
      );
    }
  }

  const published = exhibitions.filter((exhibition) => exhibition.status === 'published');
  invariant(published.length === 1, `Exactly one exhibition must be published; found ${published.length}.`);
}
