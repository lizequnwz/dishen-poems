export type ReviewAction = 'approve' | 'correct' | 'hold' | 'reject';

export interface PdfReviewBatch {
  id: string;
  pageRange: { from: number; to: number; inclusive: true };
  rawCandidates: number;
  includedCandidates: number;
  permanentlyExcluded: number;
}

export interface PdfReviewDecision {
  id: string;
  candidateId: string;
  action: ReviewAction;
  reason: string;
  pdfSha256: string;
  extractedContentFingerprint: string;
  reviewedAt: string;
  reviewedBy: string;
  corrections?: {
    title: string;
    body: string;
    writtenDate: string;
    candidateType: 'poetry' | 'excluded';
  };
}

export interface PdfCandidate {
  candidateId: string;
  reviewBatchId: string;
  title: string;
  body: string;
  writtenDate: string | null;
  pdfPage: number;
  region: string;
  regionSequence: number;
  printedPage: number | null;
  layoutTemplate: string;
  layoutTemplateStatus: string;
  pdfSha256: string;
  contentFingerprint: string;
  confidence: 'low' | 'medium' | 'high';
  candidateType: 'poetry' | 'excluded';
  failureReasons: string[];
  cropAgreement: boolean;
  autoEligible: boolean;
  manualEligible: boolean;
  publicationState: string;
  decision: PdfReviewDecision | null;
  cropImage: string;
  pageImage: string;
}

export interface PdfCandidateCatalog {
  version: number;
  rulesVersion: string;
  pdf: string;
  pdfSha256: string;
  coverage: PdfReviewBatch[];
  summary: Record<string, number>;
  candidates: PdfCandidate[];
}
