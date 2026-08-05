---
layer: core.simulation.runtime
name: Simulation controller
role: Host-side controller for a run — owns the transport, the frame store and the status streams
seams:
  - "@hashintel/petrinaut-core"
boundaries:
  - kind: thread
    note: Talks to the worker only through the transport; it holds no reference to engine state
---

# Simulation controller

The main-thread half of a run. `createSimulation` here is what a host actually
calls; the engine and worker below it never talk to the host directly.

- `transport.ts` — the message channel to the worker, and the ack/backpressure
  protocol that decides when the worker may compute more.
- `frame-store.ts` — retains computed frames so the host can scrub back through
  a run.
- `simulation.ts` — assembles the two into a handle exposing `status`, `frames`,
  `getFrame`, `ack` and `setBackpressure`.

This split is why the same engine serves both execution paths: an interactive run
keeps every frame in the store here, while an experiment reuses two buffers in
the worker and never populates a store at all.
