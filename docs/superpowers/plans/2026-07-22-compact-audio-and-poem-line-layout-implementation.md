# Compact Audio and Poem Line Layout Implementation Plan

## Scope

Implement the approved design in `docs/superpowers/specs/2026-07-22-compact-audio-and-poem-line-layout-design.md` without changing poem Markdown, audio assets, or playback rules.

## Steps

1. Add pure helpers and tests for deterministic longest-line typography tiers and safe normalization of the saved audio-panel expanded state.
2. Update `PoemText` and both poem renderers to use the line tier. Mark the single-poem layout when descriptive tags are absent and omit its empty imagery aside.
3. Restructure the production `AudioPlayer` into a compact always-visible bar and an accessible expandable panel while leaving the preview player expanded in document flow.
4. Extend the audio initializer to restore and persist panel state, synchronize `aria-expanded`, and return focus to the toggle when collapsing.
5. Replace the old large fixed-player CSS with compact desktop/mobile layouts, safe-area spacing, a bounded expanded panel, source-line no-wrap rules, poem overflow handling, wider tag-free poem cards, and print adjustments.
6. Run Astro check, Vitest, PDF tests, and the static build. Repeat the importer-independent UI checks for regressions.
7. Start the local site and visually inspect 《普陀境》 at desktop width, 320px width, and 200% zoom. Verify collapsed and expanded player states, keyboard focus, dark mode, and that content is not obscured.
8. Update `HANDOFF.md`, commit the implementation as an independent rollback point, and push `main` after all checks pass.
