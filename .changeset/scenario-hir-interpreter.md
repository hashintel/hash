---
"@hashintel/petrinaut-core": patch
"@hashintel/petrinaut": patch
---

Scenario code runs in an interpreter instead of `new Function`, and is stricter: `==` is strict, conditions take booleans, unknown place names are errors, and only `.map`, `.reduce` and `.concat` array methods are available.
