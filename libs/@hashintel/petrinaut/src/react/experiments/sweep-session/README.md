---
layer: react.experiments.sweep
role: The sweep session's private pieces (selection keys and range draws)
---

`sweep-session.ts` in the parent folder is the orchestrator (the refine ladder with pipelined rungs, the per-selection cache, the run cap, the navigation waiters behind `navigateTo` and the visited-cell list). Its private piece is `selection-draws.ts`, which names selections and draws per-run values for a range. The batch registry behind the activity list and the leading-edge, trailing-coalesce timer live in `../shared/`, shared with the optimizations provider and the detached objective runs.
