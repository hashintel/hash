---
"@hashintel/petrinaut-core": patch
---

Constraints become evaluable: `constraintMargin` and `evaluateParameterConstraints` give a parameter constraint's signed slack at a point (`margin >= 0` means satisfied), `compileStateConstraintIndicator` compiles a state constraint as a 0/1 metric, and a user-defined metric's per-run values honour its time aggregation. The manifest accepts an optional `constraintPolicy` (alpha, default 0.05) and the browser runtime's trial events carry an optional `constraints` block with per-constraint margins and per-run pass counts.
