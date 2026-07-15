---
"@siteimprove/alfa-aria": minor
---

**Fixed:** `<img>` with an empty `alt` but a non-empty `title` is now mapped to the `img` role instead of `presentation`.

As per [HTML-AAM](https://www.w3.org/TR/html-aam-1.0/#el-img-empty-alt), an `img` element with an empty `alt` attribute that is given an accessible name by another naming mechanism keeps its implicit `img` role. The `aria-label` and `aria-labelledby` mechanisms were already handled by presentational role conflict resolution; this adds the `title` mechanism, matching the behavior of Chromium, Firefox, and WebKit.
