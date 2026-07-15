---
"@siteimprove/alfa-dom": patch
---

**Fixed:** `Native.fromNode` now records layout boxes in "layout viewport" coordinates, i.e. relative to the top-left corner of the document, instead of relative to the current scroll position.

Previously, snapshotting a page that had been scrolled (e.g. by a URL fragment, an autofocused element, or a script) gave content above the scroll position a negative `y` position, which was then incorrectly treated as off-screen and thus invisible, silently excluding it from most rules. Snapshots taken on an unscrolled page are unaffected.
