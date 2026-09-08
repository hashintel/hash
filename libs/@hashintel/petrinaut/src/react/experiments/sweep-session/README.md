---
layer: react.experiments.sweep
role: The sweep session's private pieces (selection keys and range draws, cell batching)
---

`sweep-session.ts` in the parent folder is the orchestrator (the refine ladder with pipelined rungs, the per-selection cache, the streamed gate). These modules are its private pieces: `selection-draws.ts` names selections and draws per-run values for a range, `cell-batch.ts` turns a chunk of surface cells into one experiment and regroups per-run values into cell means. The batch registry behind the activity list and the leading-edge, trailing-coalesce timer live in `../shared/`, shared with the optimizations provider and the detached objective runs.
