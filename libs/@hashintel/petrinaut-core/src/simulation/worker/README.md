---
layer: core.simulation.worker
role: Worker side of `createSimulation`, computing a run's frames off the main thread no faster than the host acknowledges them. The editor starts no run through it
---

# Simulation worker

The worker of the frame runtime. `simulation.worker.ts` builds a run on
`init`, computes its frames in batches with `computeNextFrame`, and posts each
batch to the host. It computes no further than the host has acknowledged, so
the host's pace bounds the worker's memory. `messages.ts` defines the messages
and `create-simulation-worker.ts` creates the worker.
[Worker protocol and backpressure](doc:core.simulation.worker/protocol) states
the messages, the ack contract and the lifecycle.
