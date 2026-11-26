---
"@siteimprove/alfa-dom": patch
---

**Fixed:** `Native.fromNode` now skips CSS rules of unsupported types instead of dropping the whole style sheet

A rule that could not be serialised (e.g., `@container`, `@property`, `@scope`, `@starting-style`, `@counter-style`) made its style sheet, or the `@media`, `@supports` or `@layer` block containing it, appear empty. Such a rule is now skipped on its own, together with the rules it contains, and its siblings are kept. Each skipped rule type is recorded once in the `logs`, with the number of rules skipped. A style sheet whose rules cannot be read at all, typically a cross-origin sheet fetched without CORS, is now also recorded in the `logs`. (#2188)
