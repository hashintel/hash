---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Scenario code fixes and helpers: array methods that read `.constructor` internally (`.map`, `.filter`, `.slice`, `.concat`, `.flatMap`) no longer throw inside scenario expressions and "Define as code" initial state; a Python-style `range(end)` / `range(start, end, step?)` helper is now in scope (and typed in the code editors); scenario compilation errors are surfaced in Simulation Settings instead of being silently ignored.
