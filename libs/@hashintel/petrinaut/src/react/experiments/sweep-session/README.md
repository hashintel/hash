---
layer: react.experiments.sweep
role: The sweep session's private pieces (selection keys and range draws)
---

`sweep-session.ts` in the parent folder is the orchestrator (the refine ladder with pipelined rungs, the per-selection cache, the streamed gate). Its private piece is `selection-draws.ts`, which names selections and draws per-run values for a range. The batch registry behind the activity list and the leading-edge, trailing-coalesce timer live in `../shared/`, shared with the optimizations provider and the detached objective runs.
