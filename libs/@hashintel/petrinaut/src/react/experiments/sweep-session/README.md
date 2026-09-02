---
layer: react.experiments.sweep
role: The sweep session's private pieces (selection keys and range draws, the batch registry, cell batching, the publish throttle)
---

`sweep-session.ts` in the parent folder is the orchestrator (the refine ladder with pipelined rungs, the per-selection cache, the streamed gate). These modules are its private pieces: `selection-draws.ts` names selections and draws per-run values for a range, `batch-registry.ts` tracks every computing batch for the activity list, `cell-batch.ts` turns a chunk of surface cells into one experiment and regroups per-run values into cell means, `throttle.ts` is the leading-edge, trailing-coalesce timer both the publish and the batch refresh use.
