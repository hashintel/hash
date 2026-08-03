---
"@hashintel/petrinaut-core": patch
---

Add a Scenario HIR: server-side scenario evaluation (parameter overrides, per-place initial-state expressions, code-mode initial state) is compiled once through the restricted HIR pipeline and evaluated per trial, so raw manifest strings never reach `new Function` on the server. The in-editor sandboxed path is unchanged.
