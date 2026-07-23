# Dishen Poems Handoff

## Current objective

Publish the approved pages 25–50 PDF batch in controlled year-by-year increments without overwriting unrelated work. The remaining PDF pages and the development-only review dashboard are recorded here but intentionally deferred. The three-layer audio work is complete in commit `ba7a236`.

## Source of truth

- Audio design: `docs/superpowers/specs/2026-07-22-three-layer-audio-ducking-design.md` (commit `a706dd7`).
- Product design and implementation plan: `docs/superpowers/specs/2026-07-20-dishen-zen-poetry-website-design.md` and `docs/superpowers/plans/2026-07-21-dishen-poetry-mvp-implementation.md`.
- PDF extraction decision: `docs/adr/0003-calibrated-pdf-ingestion.md` and `scripts/import_pdf_poems.py`.
- Current generated extraction artifacts: `tmp/pdf-import/report.json` and `tmp/pdf-import/calibration/manifest.json`.
- Layout decisions: `imports/pdf-layout-calibrations.json`.

## Locked decisions

- Reject `spread-964696f761`, represented by “和尚祝全世界广众虎年吉祥！” on PDF page 7 right. It is front matter, not formal poetry.
- Formal poetry begins on PDF page 24; nothing before that page may be published.
- Pages 25–50 inclusive are the first extraction batch. The user completed and approved its poem review on 2026-07-22.
- Pages and half-page regions can contain multiple poems. Preserve document order and never assume one poem per page or region.
- Keep the existing year-by-year publication gate after batch review.
- Only unambiguous, full Gregorian dates qualify. Exclude prose, couplets, introductions, and mixed content.
- Preserve all existing worktree changes and do not reset or broadly reformat them.

## Verified batch facts

- Pages 25–50 yield 65 candidates: 64 classified as poetry, 62 high confidence, and all 65 with a parsed full date.
- The user approved the extracted poems' title, body, punctuation, and date on 2026-07-22.
- “弟子求对联” on page 25 remains explicitly excluded as a couplet.
- “出门儿” and “赠众生” passed human content review, but remain medium-confidence ingestion candidates because small-print annotations make coordinate and crop text differ. Publish them only after recording an explicit manual override or reconciling the two extraction paths; do not weaken the global high-confidence rule.
- The range contains six layout templates: `spread-4bb95f21ab`, `spread-895df3e0ab`, `spread-b4c9f9ead7`, `spread-ccfa425d52`, `spread-e6a283a8d6`, and `spread-f4d759d177`.
- Many regions yield two poems; several pages yield four candidates. The range spans 2005–2006.
- The automatically eligible set contains 37 poems from 2006 and 25 poems from 2005.
- The generated local review bundle is `tmp/pdf-import/review-25-50/REVIEW.md`, with machine-readable data in `review.json` and 65 images under `crops/`.

## Remaining work

### Approved batch publication

1. Generate only the 37 automatically eligible 2006 poems from pages 25–50 with `--apply --publish-year 2006`.
2. Inspect the generated Markdown and validate the catalog, date navigation, random navigation, homepage latest-five selection, tests, and static build. Commit and deploy this year as an independent rollback point.
3. Repeat the same process for the 25 automatically eligible 2005 poems with `--publish-year 2005`.
4. Keep “出门儿” and “赠众生” out of automatic publication until their reviewed manual decisions are represented by a tracked override or their extraction mismatch is resolved. Keep “弟子求对联” excluded.

### Deferred PDF coverage

- Extract and review physical PDF page 24, which belongs to the formal poetry section but was intentionally omitted from the first batch.
- Continue from physical PDF page 51 through the end in small, inclusive page ranges. Do not extract or publish all remaining pages as one unreviewable batch.
- Preserve multiple poems per page and per half-page, full Gregorian date requirements, calibrated-layout gating, document order, stable fingerprints, and the year-by-year publication gate.
- Store future review decisions in a tracked, machine-readable approval/override manifest so a rebuilt review bundle retains human decisions.

## Deferred development-only review desk

Design and build `/preview/pdf/` in a later iteration. It must be available only in development and absent from production output.

The desk should:

- consume generated review artifacts rather than parse PDFs in the browser;
- display each PDF crop beside the extracted title, body, punctuation, date, PDF page/region/order, failure reasons, confidence, and publication status;
- support filtering by page range, year, status, and confidence;
- support explicit approve, reject, correct, and hold decisions;
- persist decisions to a tracked, machine-readable approval/override manifest rather than relying only on browser state or `localStorage`;
- export deterministic reviewed data that the importer can consume without weakening its normal safety gates.

## Acceptance checks

- Pages before 24 can never publish.
- A pages 25–50 dry run reports only that inclusive range and does not modify `poems/`.
- Multiple poems in one page or half-page remain separate and correctly ordered.
- Rejected or uncalibrated layouts cannot produce verified content.
- Apply mode refuses overwrites and preserves stable slugs and fingerprints.
- Astro check, unit tests, PDF tests, and static build pass after every deployable phase.

## Suggested skills

- `brainstorming` before any new behavior or the deferred review-desk design.
- `pdf:pdf` for source/crop comparison and multi-poem layout verification.
- `ui-styling` only after the review-desk design is approved.
- `grilling` before relaxing any automatic-publication gate.

## Repository hygiene

Candidate MP3 files under `audio/candidates/` are local review artifacts and are ignored by Git. Seven approved production MP3 files are tracked under `public/audio/` with checksums and attribution; the older seven candidates remain unapproved.
