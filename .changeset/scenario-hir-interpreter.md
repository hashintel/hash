---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Compile scenario code (parameter overrides, per-place expressions, code-mode initial state) through the HIR and evaluate it with an interpreter. The scenario path no longer uses `new Function` or the runtime sandbox: lowering runs in the language worker (browser) or inline (Node), `compileScenario` takes the lowered result as an argument, and out-of-subset code is rejected with positioned errors in the editor and at compile. Behaviour changes: `Array.from({ length: n }, ...)` is desugared to `range(n).map(...)`; array methods outside the subset (`.filter`, `.slice`, ...) are rejected; conditions and `&&`/`||` require booleans and arithmetic requires numbers; `==` is strict, and comparing across types (boolean with number) is flagged as a constant result; a code-mode key that is not a place name is now a compile error instead of being silently ignored.
