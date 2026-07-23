# Dishen Poems Handoff

## Current objective

Continue the bounded PDF review without overwriting unrelated work. The three-layer audio work is complete in commit `ba7a236`. The future PDF review dashboard is recorded here but intentionally deferred.

## Source of truth

- Audio design: `docs/superpowers/specs/2026-07-22-three-layer-audio-ducking-design.md` (commit `a706dd7`).
- Product design and implementation plan: `docs/superpowers/specs/2026-07-20-dishen-zen-poetry-website-design.md` and `docs/superpowers/plans/2026-07-21-dishen-poetry-mvp-implementation.md`.
- PDF extraction decision: `docs/adr/0003-calibrated-pdf-ingestion.md` and `scripts/import_pdf_poems.py`.
- Current generated extraction artifacts: `tmp/pdf-import/report.json` and `tmp/pdf-import/calibration/manifest.json`.
- Layout decisions: `imports/pdf-layout-calibrations.json`.

## Locked decisions

- Reject `spread-964696f761`, represented by “和尚祝全世界广众虎年吉祥！” on PDF page 7 right. It is front matter, not formal poetry.
- Formal poetry begins on PDF page 24; nothing before that page may be published.
- Use pages 25–50 inclusive as the first extraction and review batch. Publish nothing from this batch until it is checked.
- Pages and half-page regions can contain multiple poems. Preserve document order and never assume one poem per page or region.
- Keep the existing year-by-year publication gate after batch review.
- Only unambiguous, full Gregorian dates qualify. Exclude prose, couplets, introductions, and mixed content.
- Preserve all existing worktree changes and do not reset or broadly reformat them.

## Verified batch facts

- Pages 25–50 yield 65 candidates: 64 classified as poetry, 62 high confidence, and all 65 with a parsed full date.
- “弟子求对联” on page 25 is explicitly excluded as a couplet. “出门儿” and “赠众生” remain medium confidence because small-print annotations make coordinate and crop text differ.
- The range contains six layout templates: `spread-4bb95f21ab`, `spread-895df3e0ab`, `spread-b4c9f9ead7`, `spread-ccfa425d52`, `spread-e6a283a8d6`, and `spread-f4d759d177`.
- Many regions yield two poems; several pages yield four candidates. The range spans 2005–2006.
- The generated local review bundle is `tmp/pdf-import/review-25-50/REVIEW.md`, with machine-readable data in `review.json` and 65 images under `crops/`.

## Remaining work

1. Review all 65 candidates in `tmp/pdf-import/review-25-50/REVIEW.md` before generating Markdown. Pay special attention to the two medium-confidence annotation cases.
2. Record corrections without weakening the global page floor, layout calibration, confidence, duplicate, or overwrite gates.
3. After explicit batch approval, generate eligible Markdown with `--apply` and continue public rollout year by year.

## Deferred development-only review desk

Design and build `/preview/pdf/` in a later iteration. It should display each PDF crop beside the extracted title, body, date, failure reasons, confidence, and publication status. It must consume generated review artifacts, must not parse PDFs in the browser, and must not exist in production output.

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
