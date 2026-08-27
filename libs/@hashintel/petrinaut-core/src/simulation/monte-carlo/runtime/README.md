---
layer: core.simulation.monte-carlo.runtime
role: Fans one experiment out across shard transports and merges their streams into one handle
---

# Experiment runtime

`createMonteCarloExperiment` (`experiment.ts`) owns the lifecycle of one
experiment: it splits the runs into shards, starts one transport per shard,
merges the per-frame metric states the shards stream back, and exposes the
result as the `MonteCarloExperiment` handle — status, progress, metrics, run
results, events.

Two invariants make shard count invisible to results:

- **Seeds derive from the global run index.** `shard-plan.ts` assigns each
  shard a contiguous slice of runs and its global index offset, so run _i_
  gets the same seed regardless of which shard owns it.
- **Frames are released on a watermark.** A frame number finalises only once
  every still-running shard has reported it; a finished shard drops out of the
  watermark rather than blocking it.

The runtime does not know what a shard runs on. Hosts supply a worker factory
— a Web Worker in the editor, `worker_threads` in the CLI, the in-process
worker in tests — and the shard count is the host's decision too.

`experiment-stores.ts` holds the store and event plumbing shared by every
experiment backend: the WebGPU backend presents the identical
`MonteCarloExperiment` handle, so the stores are shared rather than duplicated
and cannot drift.
