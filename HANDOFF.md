# Dishen Poems Handoff

## Current state

The remaining-PDF, development review desk, visual expansion, and 167-poem automatic publication project was completed on 2026-07-23. The production collection now contains **258 verified/curated poems** with unique stable routes. Homepage latest-five still resolves from the newest 2026 works.

Authoritative design: `docs/superpowers/specs/2026-07-23-pdf-review-visual-expansion-design.md`.

## Completed PDF coverage

- Formal poetry begins at physical PDF page 24. No page before 24 is eligible.
- The tracked batch registry is `imports/pdf-review-batches.json` and covers page 24 plus pages 51–206. The earlier pages 25–50 batch remains part of the published collection.
- The frozen remaining-page regression baseline is exact: 177 candidates, 175 poetry candidates, 167 high, 8 medium, and 2 low/excluded. There are no cross-batch title/date duplicates.
- Page 204 “师父为坐下弟子建的QQ群写的群联：” is permanently excluded by `couplet_excluded`. Pages 174–203 were scanned and yielded no complete-date candidates.
- The shared deterministic catalog is generated at `tmp/pdf-import/catalog/catalog.json`; the review desk and publisher both consume it. It is intentionally ignored by Git and can be recreated with `npm run pdf:catalog`.
- `scripts/publish_pdf_catalog.py` never rescans the PDF, never overwrites existing Markdown, and validates the catalog rules version plus PDF checksum before planning a year.

## Automatic publication completed

The 167 zero-failure high candidates were published as 17 independent year commits, each after a complete `npm run build`:

| Year | Count | Commit |
|---:|---:|---|
| 2023 | 1 | `14418dc` |
| 2021 | 2 | `0716ed7` |
| 2020 | 9 | `6b4d728` |
| 2019 | 2 | `9cf251d` |
| 2018 | 1 | `1d6d538` |
| 2017 | 3 | `aa5ab3d` |
| 2015 | 2 | `8faeb4c` |
| 2014 | 4 | `125ec9e` |
| 2013 | 2 | `96f6574` |
| 2012 | 6 | `5d3dd81` |
| 2011 | 9 | `c08df53` |
| 2010 | 8 | `cfd6ba9` |
| 2009 | 14 | `0758066` |
| 2008 | 22 | `acca69e` |
| 2007 | 50 | `5583e51` |
| 2006 | 30 | `2f06cc6` |
| 2005 | 2 | `557404d` |

The previous collection had 91 poems; `91 + 167 = 258`. No existing poem body was rewritten by these commits.

## Development PDF review desk

- Run `npm run pdf:catalog`, then `npm run dev`, and open `/preview/pdf/`.
- The route and its `__pdf-review` read/write middleware exist only under the Vite development server. Production static builds contain neither the page, review data, crops, nor a write endpoint.
- The desk supports batch, year, page, confidence, decision, publication-status, and text filters. It shows the queue, crop/full-page context, extracted fields, failures, source audit, and before/after corrections.
- Decisions are written only by **Save and next**. The middleware accepts same-origin localhost requests, validates every field and candidate identity, then atomically updates `imports/pdf-review-decisions.json`.
- Decisions are valid only while candidate ID, PDF SHA-256, and extracted fingerprint all match. Explicit hold/reject always overrides automatic eligibility.

## Human review completed; supplemental publication pending

All 12 review exceptions now have tracked human decisions in `imports/pdf-review-decisions.json` (commit `f9c2e29`):

- 10 approved without text changes;
- 《弹指微风射大汗》 corrected and approved;
- 《妙湛寺过斋》 reconstructed, classified as poetry, and approved.

They remain intentionally **unpublished** because the approved plan kept the 12 manual exceptions out of the 167 automatic batch and required separate supplemental year checkpoints. Their years are:

- 2020: 1
- 2019: 1
- 2012: 2
- 2011: 2
- 2008: 2
- 2006: 4

Next publication step: for each year above, first dry-run and inspect the exact delta, then use `--include-reviewed --apply`, run the full build, and commit that year's new files independently. Do not alter original confidence or failure reasons; manual review is represented by `reviewDecisionId` and, for corrections, `extractedContentFingerprint`.

## Visual system completed

- `VisualProfile` now supports `sceneFamily`: `landscape`, `courtyard`, `scroll`, or `celestial`.
- Code-native motifs include mountain/water/weather plus enso, moon gate, lattice window, bamboo, bird, lantern, lotus ripple, bell ripple, and sutra thread. Palettes include low-saturation saffron and lapis.
- Resolution remains deterministic from complete date, literal text signals, and stable ID. Runtime randomness is not used, and automatic signals never become public tags.
- Homepage latest-five uses five distinct compositions spanning at least four scene families; explicit frontmatter overrides remain authoritative.
- Single-poem pages use family-specific reading frames while preserving the poem safe area and original line breaks. Mobile degrades to one stable column; print removes nonessential scenery.
- `/archive/` is now a deterministic year gallery. `/archive/[year]/` groups every work by month and adds month anchors for populous years. The homepage includes the compact “诗卷年轮” entry.
- No PDF photography, new curated raster image, Tailwind, shadcn, or runtime visual dependency was introduced. Future curated-image work should continue using the existing asset override interface and a separate human review flow.

## Validation baseline

- Public poems: 258
- Duplicate slugs: 0
- Vitest: 66 tests
- Python PDF suite: 12 tests
- Final automatic-year build: 281 static pages
- Production `/preview/pdf/` and `__pdf-review`: absent
- Browser checks: review crop loading, 12-item exception queue, five homepage compositions/four families, year cards, mobile single-column gallery, and month anchors.

Before the next deploy, rerun `npm run build`, the bundled Python PDF suite, `git diff --check`, and the production-route absence assertion. Regenerate the ignored catalog if `tmp/pdf-import/catalog/catalog.json` is unavailable.

## Repository hygiene

- `tmp/pdf-import/`, PDF crops, full-page thumbnails, build output, caches, and candidate MP3 files remain untracked.
- Approved production audio stays under `public/audio/`; audio attribution remains generated from the tracked manifest.
- Preserve tracked review decisions and all stable poem URLs. Never broadly regenerate or rewrite already published Markdown.
