import { describe, expect, it } from 'vitest';
import { validateSiteRecords, type RuleExhibition, type RulePoem } from '../src/lib/content-rules';

const poems: RulePoem[] = [
  { id: 'poem-one', slug: '2026-01-01-one', status: 'verified' },
  { id: 'poem-two', slug: '2026-01-02-two', status: 'curated' },
];

const exhibition: RuleExhibition = {
  id: 'current',
  status: 'published',
  poemIds: ['poem-one', 'poem-two'],
};

describe('validateSiteRecords', () => {
  it('accepts one published exhibition of verified poems', () => {
    expect(() => validateSiteRecords(poems, [exhibition])).not.toThrow();
  });

  it('rejects multiple current exhibitions', () => {
    expect(() => validateSiteRecords(poems, [exhibition, { ...exhibition, id: 'other' }])).toThrow(
      'Exactly one exhibition must be published',
    );
  });

  it('rejects ingested poems in any exhibition', () => {
    expect(() =>
      validateSiteRecords([{ ...poems[0], status: 'ingested' }, poems[1]], [exhibition]),
    ).toThrow('cannot include unverified poem');
  });

  it('rejects duplicate or missing poem references', () => {
    expect(() =>
      validateSiteRecords(poems, [{ ...exhibition, poemIds: ['poem-one', 'poem-one'] }]),
    ).toThrow('duplicate poem ids');
    expect(() =>
      validateSiteRecords(poems, [{ ...exhibition, poemIds: ['poem-one', 'missing'] }]),
    ).toThrow('references missing poem');
  });

  it('only publishes high-confidence PDF poems from calibrated templates', () => {
    const pdfPoem: RulePoem = {
      id: 'poem-pdf',
      slug: '2023-01-01-pdf',
      status: 'verified',
      source: { kind: 'pdf', confidence: 'high', layoutTemplateStatus: 'pending' },
    };
    expect(() => validateSiteRecords([pdfPoem], [{ ...exhibition, poemIds: ['poem-pdf'] }])).toThrow(
      'calibrated layout template',
    );
    expect(() =>
      validateSiteRecords(
        [{ ...pdfPoem, source: { kind: 'pdf', confidence: 'medium', layoutTemplateStatus: 'calibrated' } }],
        [{ ...exhibition, poemIds: ['poem-pdf'] }],
      ),
    ).toThrow('high confidence or an exact approved review decision');
    expect(() =>
      validateSiteRecords(
        [{ ...pdfPoem, source: { kind: 'pdf', confidence: 'high', layoutTemplateStatus: 'calibrated' } }],
        [{ ...exhibition, poemIds: ['poem-pdf'] }],
      ),
    ).not.toThrow();
  });

  it('allows an exact manual review without changing extraction confidence', () => {
    const pdfPoem: RulePoem = {
      id: 'poem-reviewed',
      slug: '2023-01-01-reviewed',
      status: 'verified',
      source: {
        kind: 'pdf',
        pdfSha256: 'a'.repeat(64),
        confidence: 'medium',
        layoutTemplateStatus: 'calibrated',
        failureReasons: ['coordinate_crop_mismatch'],
        candidateId: 'pdf-abc',
        contentFingerprint: 'b'.repeat(64),
        reviewDecisionId: 'review-pdf-abc',
      },
    };
    const decision = {
      id: 'review-pdf-abc',
      action: 'approve' as const,
      candidateId: 'pdf-abc',
      pdfSha256: 'a'.repeat(64),
      extractedContentFingerprint: 'b'.repeat(64),
    };
    const reviewedExhibition = { ...exhibition, poemIds: ['poem-reviewed'] };
    expect(() => validateSiteRecords([pdfPoem], [reviewedExhibition], [decision])).not.toThrow();
    expect(() => validateSiteRecords([pdfPoem], [reviewedExhibition], [{ ...decision, extractedContentFingerprint: 'c'.repeat(64) }])).toThrow(
      'exact approved review decision',
    );
  });
});
