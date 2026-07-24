export function isAllowedReviewOrigin(origin?: string, host?: string): boolean;
export function validateReviewSubmission(payload: unknown, catalog: { candidates: unknown[] }): unknown;
export function pdfReviewDevPlugin(options?: Record<string, string>): unknown;
