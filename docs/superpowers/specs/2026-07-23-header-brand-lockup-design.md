# Header Brand Lockup

## Objective

Remove the repeated “谛” in the site header while preserving the existing seal-and-wordmark composition. The header should read as one continuous brand name, “谛深禅诗”.

## Design

- Replace the single-character “谛” inside the vermilion square with “谛深”, arranged vertically to fit the existing seal shape.
- Replace the adjacent “谛深 · 禅诗” wordmark with “禅诗”.
- Remove the separator dot because the seal and adjacent wordmark already provide sufficient visual separation.
- Keep the existing link, accessible label, colors, typography family, and header navigation behavior.
- Preserve the mobile rule that hides the adjacent wordmark; the “谛深” seal remains visible and identifies the site without duplication.

## Responsive and accessibility requirements

The two seal characters must remain legible without enlarging the header. The seal must keep its current visual footprint or make only the smallest necessary width adjustment. Script conversion must continue to apply to both “谛深” and “禅诗”. The home-link accessible label remains “谛深禅诗首页 / Dishen poetry home”.

## Validation

- Confirm the desktop header renders “谛深” once, followed by “禅诗”.
- Confirm the mobile header shows the “谛深” seal without overflow.
- Run Astro diagnostics and the production build.
