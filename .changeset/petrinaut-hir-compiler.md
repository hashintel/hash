---
"@hashintel/petrinaut": minor
"@hashintel/petrinaut-core": minor
---

Compile Petrinaut user code (dynamics, lambdas, transition kernels) through a
new HIR pipeline instead of Babel. Compiled buffer-ABI programs read token
attributes at statically resolved offsets in the packed frame buffers;
simulations now require precompiled `hirArtifacts` (produced via the language
worker's `requestHirArtifacts`). Simulation worker bundles shrink by ~3 MB
each. Out-of-subset user code is reported as an error diagnostic and cannot
run; supported idioms now include destructuring (`const { a, b } =
parameters`) and guard-clause `if`/early returns. Adds
`@hashintel/petrinaut-core/hir` (compiler; optional `typescript` peer) and
`@hashintel/petrinaut-core/hir-runtime` (dependency-free instantiation)
entries, plus an HIR playground story.
