---
"@hashintel/petrinaut-core": patch
---

The language server reuses a net's diagnostics across ad-hoc session syncs, and the language client skips a publish whose diagnostics did not change. `createAdHocTargetLabeler` and `createAdHocPlaceTotalResolver` label targets and resolve place totals for a whole state in one pass.
