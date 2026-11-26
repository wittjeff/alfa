---
"@siteimprove/alfa-dom": minor
---

**Added:** `Native.fromNode` now serialises nested CSS rules

Style rules nested in another style rule were dropped, as were the declarations following them and the `@media`, `@supports` and `@layer` rules nested in a style rule. They are now flattened: each is serialised after its parent rule, in the order the CSS Nesting specification gives them in the cascade, with the nesting selector `&` replaced by `:is(<parent selector>)`. No change is needed in the selector parser or in the cascade. (#1752)
