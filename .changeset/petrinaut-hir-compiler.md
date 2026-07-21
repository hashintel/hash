---
"@hashintel/petrinaut": patch
"@hashintel/petrinaut-core": patch
---

Compile all user code (dynamics, rates, kernels, metrics) through a new HIR
to programs reading the packed frame buffers directly, replacing Babel.

Compatibility: code outside the supported TypeScript subset no longer runs —
it is rejected with an error diagnostic pointing at the offending syntax.
