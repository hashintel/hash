---
layer: react.simulation
name: Simulation provider
role: Owns the run configuration and mirrors the core simulation handle into React
boundaries:
  - kind: thread
    note: Wraps the core's worker transport; every frame the UI reads has crossed a thread boundary
invariants:
  - The initial marking is session state, configuration for the next run, and survives a reset
---

# Simulation provider

The React owner of a Quick Simulation run. It holds the run configuration —
initial marking, parameter values, seed, `dt`, `maxTime` — calls the core's
`createSimulation()` with a browser worker factory, and mirrors the resulting
handle's `status` and `frames` stores into context.

The distinction that catches people: the initial marking is _configuration for
the next run_, not output of the current one. Resetting a run clears frames but
deliberately keeps the marking, because the common action after a reset is to run
again with the same starting state.
