---
"@siteimprove/alfa-dom": patch
---

**Fixed:** `Native.fromNode` with `enforceAnonymousCrossOrigin` now handles the `<link>` elements of shadow trees

For each shadow tree, the `<link>` elements of the main document were processed again, and the ones of the shadow tree were left as they were.
