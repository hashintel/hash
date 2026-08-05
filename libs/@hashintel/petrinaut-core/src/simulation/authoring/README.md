---
layer: core.simulation.authoring
name: User-code authoring
role: Compiles and sandboxes the code users write inside a net
boundaries:
  - kind: sandbox
    note: User code is evaluated with restricted globals; it never receives the host scope
---

# User-code authoring

Everything between "the user typed some TypeScript into a transition" and "the
engine has a callable function".

- `sandbox.ts` — the restricted evaluation context user code runs in.
- `user-code/` — compiling lambdas, kernels, dynamics and metrics.
- `scenario/` — compiling a scenario's parameter overrides and initial state.

The engine depends on this layer but not the reverse: compilation happens once
when a run is built, and the engine then holds only the resulting functions. That
ordering is what keeps per-step execution free of compiler work.
