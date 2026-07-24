export type RulePoem = {
  id: string;
  slug: string;
  status: 'ingested' | 'verified' | 'curated';
  source?:
    | { kind: 'manual' }
    | {
      kind: 'pdf';
        pdfSha256?: string;
        confidence: 'low' | 'medium' | 'high';
        layoutTemplateStatus: 'pending' | 'calibrated';
        failureReasons?: string[];
        candidateId?: string;
        contentFingerprint?: string;
        extractedContentFingerprint?: string;
        reviewDecisionId?: string;
      };
};

export type RuleReviewDecision = {
  id: string;
  action: 'approve' | 'correct' | 'hold' | 'reject';
  candidateId: string;
  pdfSha256: string;
  extractedContentFingerprint: string;
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

export function validateSiteRecords(
  poems: RulePoem[],
  exhibitions: RuleExhibition[],
  reviewDecisions: RuleReviewDecision[] = [],
) {
  invariant(unique(poems.map((poem) => poem.id)), 'Poem ids must be unique.');
  invariant(unique(poems.map((poem) => poem.slug)), 'Poem slugs must be unique.');
  invariant(unique(exhibitions.map((exhibition) => exhibition.id)), 'Exhibition ids must be unique.');

  for (const poem of poems) {
    if (poem.source?.kind !== 'pdf' || poem.status === 'ingested') continue;
    const source = poem.source;
    invariant(
      source.layoutTemplateStatus === 'calibrated',
      `Published PDF poem "${poem.id}" must use a calibrated layout template.`,
    );
    const failures = source.failureReasons ?? [];
    const automatic = source.confidence === 'high' && failures.length === 0;
    const decision = reviewDecisions.find((item) => item.id === source.reviewDecisionId);
    const reviewed = Boolean(
      decision
      && (decision.action === 'approve' || decision.action === 'correct')
      && decision.candidateId === source.candidateId
      && decision.pdfSha256 === source.pdfSha256
      && decision.extractedContentFingerprint
        === (source.extractedContentFingerprint ?? source.contentFingerprint),
    );
    invariant(
      automatic || reviewed,
      `Published PDF poem "${poem.id}" must have high confidence or an exact approved review decision.`,
    );
  }

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
