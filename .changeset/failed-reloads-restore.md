---
"@siteimprove/alfa-dom": patch
---

**Fixed:** `Native.fromNode` with `enforceAnonymousCrossOrigin` no longer removes style sheets whose server does not allow cross-origin requests

When the option is set, each `<link>` element is replaced by a clone with `crossorigin="anonymous"`. If the server of a style sheet sends no CORS header, the clone fails to load and the page lost the styles of that sheet, which changed its layout and rendering before it was serialised. The original `<link>` element is now put back when its clone fails to load, and this is recorded in the `logs`.
