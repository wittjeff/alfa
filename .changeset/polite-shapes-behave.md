---
"@siteimprove/alfa-css": patch
---

**Fixed:** `polygon()` now parses its vertices as a comma-separated list, as required by [CSS Shapes Module Level 1, § 3.1](https://drafts.csswg.org/css-shapes/#funcdef-basic-shape-polygon).

Previously, vertices were expected to be separated by whitespace, which caused every polygon accepted by browsers to fail parsing (and vice versa). Serialization has been updated accordingly.
