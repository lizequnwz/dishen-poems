import { describe, expect, it } from 'vitest';
import { isAllowedReviewOrigin, validateReviewSubmission } from '../scripts/pdf-review-dev-plugin.mjs';

const candidate = {
  candidateId: 'pdf-1234567890abcdef12345678',
  pdfSha256: 'a'.repeat(64),
  contentFingerprint: 'b'.repeat(64),
};
const catalog = { candidates: [candidate] };

describe('PDF review development endpoint', () => {
  it('accepts only an exact same-origin localhost request', () => {
    expect(isAllowedReviewOrigin('http://localhost:4321', 'localhost:4321')).toBe(true);
    expect(isAllowedReviewOrigin('http://127.0.0.1:4321', '127.0.0.1:4321')).toBe(true);
    expect(isAllowedReviewOrigin('https://example.com', 'localhost:4321')).toBe(false);
    expect(isAllowedReviewOrigin(undefined, 'localhost:4321')).toBe(false);
  });

  it('binds a review decision to the frozen candidate fingerprint', () => {
    expect(validateReviewSubmission({ candidateId: candidate.candidateId, action: 'approve', reason: '' }, catalog)).toMatchObject({
      id: `review-${candidate.candidateId}`,
      action: 'approve',
      pdfSha256: candidate.pdfSha256,
      extractedContentFingerprint: candidate.contentFingerprint,
    });
  });

  it('rejects unknown candidates and invalid corrected dates', () => {
    expect(() => validateReviewSubmission({ candidateId: 'missing', action: 'approve' }, catalog)).toThrow('Unknown candidate ID');
    expect(() => validateReviewSubmission({
      candidateId: candidate.candidateId,
      action: 'correct',
      corrections: { title: '诗', body: '正文', writtenDate: '2023-02-30', candidateType: 'poetry' },
    }, catalog)).toThrow('Corrected title, body, and date are required');
  });
});
