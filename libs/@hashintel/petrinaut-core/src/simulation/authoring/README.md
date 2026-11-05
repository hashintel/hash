---
layer: core.simulation.authoring
role: Compiles the code users write inside a net — lowered, checked and interpreted, never evaluated as JavaScript
---

# Authoring

The code a net carries — dynamics, lambdas, kernels, metrics, scenario
expressions and the ad-hoc scenario form — is compiled here before anything
runs it. [Compiling user code](./user-code.mdx) walks the pipeline: every
surface lowers to the HIR, the hot paths are emitted as buffer programs, and
the scenario surfaces are interpreted.
