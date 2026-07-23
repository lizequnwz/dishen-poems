# Compact Audio Player and Poem Line Layout

## Objective

Reduce the persistent audio player's visual footprint so it does not obscure reading, and preserve every source poem line as a single visual line whenever practical. This change affects presentation and client-side UI state only; poem Markdown, source line breaks, audio assets, playlists, ducking rules, and publication metadata remain unchanged.

## Compact audio player

### Collapsed state

The production player is collapsed by default. It appears as a compact fixed bar near the lower-right edge on desktop and as a single-row bottom bar on mobile. The collapsed bar contains:

- play/pause;
- the current track label, truncated with an ellipsis when necessary;
- the main-layer mute control and volume slider;
- an expand/collapse button with an accessible label and `aria-expanded` state.

Previous/next, environment selection, environment volume, accent selection, accent volume, status details, and the decorative heading move into the expanded panel. Playback failures must still surface a concise non-blocking status in the collapsed bar.

### Expanded state

The expanded panel opens upward from the compact bar and exposes every existing control. It must not change playback state, recreate audio elements, or interfere with `transition:persist`. The existing keyboard controls, labels, live status, preference storage, audio loading rules, pause-on-background behavior, and ducking logic remain intact.

The expanded panel may cover page content temporarily because expansion is an explicit user action. Collapsing restores the small footprint immediately. The production player's expanded/collapsed state is saved separately from audio preferences and restored across Astro navigation and hard reloads. The default is collapsed when no saved preference exists.

The candidate-audio preview player remains fully expanded and in normal document flow so review controls are always visible.

### Responsive behavior

- Desktop collapsed target: approximately 360px wide and no more than 60px high.
- Mobile collapsed target: one row inside the viewport with touch targets at least 44px square.
- The document's bottom padding follows only the collapsed player's height; it must not reserve the old expanded height.
- The expanded panel is bounded by the viewport and scrolls internally if a very small screen cannot show every control.
- Safe-area insets are respected on devices with a home indicator.

## Poem line integrity

### Source-line contract

`PoemText` continues to split content only at source newline characters. Each resulting `.poem-text__line` is an indivisible visual line and uses `white-space: nowrap`. No JavaScript inserts or removes line breaks, and no poem Markdown is rewritten.

The poem-text container owns horizontal overflow. It normally shows no scrollbar because the card and typography should fit the line. On a narrow viewport where a line cannot fit at a readable size, the poem block becomes horizontally scrollable as one unit. Keyboard and touch scrolling must work, and the page itself must not gain horizontal overflow.

### Typography tiers

The display tier is derived deterministically from the longest non-empty source line, not the total poem length:

- standard for ordinary lines;
- compact for longer lines;
- long-line for unusually long prose-like poetic lines.

The tier changes font size and letter spacing only. It does not alter the words, punctuation, line height, or line boundaries. Font sizes retain a readable minimum and respond to viewport width. The same derived tier is used anywhere `PoemText` renders the poem so presentation remains consistent.

### Single-poem page layout

When `descriptiveTags` is empty, the page omits the empty imagery aside and gives its grid space to the poem card. When tags exist, the aside remains. The wider card and longest-line typography tier should allow poems such as 《普陀境》 to render without wrapping at common desktop widths.

On mobile, the card uses the available shell width with reduced padding before horizontal scrolling becomes necessary. Print styles use a smaller long-line type scale and no fixed player, while preserving source lines within the printable area whenever possible.

## State and interfaces

- Add a production-player expanded/collapsed preference under a versioned, audio-specific local-storage key.
- The preference stores only a boolean presentation state and must not be coupled to playback, volume, track, ambient, or accent state.
- Add a deterministic poem-line tier helper based on the maximum Unicode code-point count of trimmed source lines.
- `PoemText` accepts the derived tier rather than the existing total-body-length `compact` heuristic.
- The single-poem page exposes whether public descriptive tags exist so CSS can use the two-column or three-column layout without relying on `:has()` for core layout.

## Accessibility and failure handling

- Expand/collapse is a native button with a visible focus state, localized accessible label, and correct `aria-expanded`/`aria-controls` relationship.
- Collapsing the panel must not trap or lose focus. If focus is inside the panel when it collapses, focus returns to the toggle.
- Player controls remain usable at 200% browser zoom and on a 320px viewport.
- The horizontally scrollable poem body is focusable only when it actually overflows; it receives a concise bilingual accessible label and visible focus treatment.
- With JavaScript disabled, the existing native first-track fallback remains available and reading layout remains complete.
- A storage failure falls back to the collapsed state without affecting playback.

## Validation

Automated checks must cover:

- collapsed is the default and a saved expanded state is restored;
- expand/collapse does not replace the three persistent audio elements or change playback state;
- all controls remain reachable in the expanded panel;
- mobile and desktop bottom padding match the compact bar rather than the old player height;
- longest-line tier selection is deterministic at tier boundaries;
- rendered source lines use no-wrap styling and retain the exact Markdown line count;
- an empty `descriptiveTags` list removes the unused aside and widens the poem card;
- random navigation, ClientRouter persistence, ducking, language/script switching, reduced motion, dark mode, and print behavior continue to work.

Manual browser checks must include 《普陀境》 at desktop widths, a 320px mobile viewport, 200% zoom, expanded and collapsed audio states, keyboard focus order, touch-style horizontal poem scrolling, and confirmation that the compact player does not cover the final poem lines or navigation controls.

The phase is complete only after Astro check, all Vitest tests, all PDF tests, and the static build pass.
