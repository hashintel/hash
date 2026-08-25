---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Scenario code (parameter overrides, per-place expressions, code-mode initial state) now compiles through the HIR and runs in an interpreter: no `new Function`, no sandbox. Out-of-subset code fails with positioned errors in the editor and at compile. Stricter than the old evaluator: `==` is strict, conditions and `&&`/`||` take booleans, unknown place names in code mode are errors, and array methods beyond `.map`/`.reduce`/`.concat` are unavailable. `Array.from({ length: n }, fn)` desugars to `range(n).map(fn)`.
