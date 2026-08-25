---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Compile scenario code (parameter overrides, per-place expressions, code-mode initial state) through the HIR and evaluate it with an interpreter. The scenario path no longer uses `new Function` or the runtime sandbox: lowering runs in the language worker (browser) or inline (Node), `compileScenario` takes the lowered result as an argument, and out-of-subset code is rejected with positioned errors in the editor and at compile. `Array.from({ length: n }, ...)` is desugared to `range(n).map(...)`; array methods outside the subset (`.filter`, `.slice`, ...) are no longer available in scenario code.
