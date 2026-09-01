---
"@hashintel/petrinaut-core": patch
---

Expose the selection vocabulary as data: `selectionItemTypes` and
`canonicalizeSelection` are available from a dependency-free
`@hashintel/petrinaut-core/selection` entry, so hosts can validate and order
selection coming from a URL or an HTTP request without pulling the model or any
React code.
