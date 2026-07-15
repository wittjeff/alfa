---
"@siteimprove/alfa-style": patch
---

**Fixed:** `isVisible` now considers elements that are fully masked by an empty `clip-path` as invisible.

Basic shapes that are guaranteed to enclose an empty area are detected: a `polygon()` whose vertices are all identical (e.g. `polygon(0 0, 0 0, 0 0)`), a `circle()` or `ellipse()` with a zero radius, an `inset()` whose insets consume the full box in some axis (e.g. `inset(50%)`), and a `rect()` with coinciding edges. Other values (URL references, calculated values, non-degenerate shapes) are still assumed to show the content.
