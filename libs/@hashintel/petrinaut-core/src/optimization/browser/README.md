---
layer: core.optimization.browser
role: Runs the Optuna study in a Pyodide worker and evaluates trials through the host channel
---

# Browser optimization runtime

`createBrowserOptimization` is a `PetrinautConnectedOptimization`: a host
connects it to a `PetrinautOptimizationChannel` and receives the same
capability a remote optimization service offers, plus `extendOptimizationRun`
and `releaseOptimizationRun` for the study the worker keeps between segments.

## Three tiers

| Tier         | Where it runs      | Files                                                              |
| ------------ | ------------------ | ------------------------------------------------------------------ |
| Capability   | the main thread    | `browser-optimization.ts`, `run-log.ts`, `messages.ts`             |
| Worker       | a module worker    | `worker/optimizer.worker.ts`, `worker/attach-optimizer-worker.ts`  |
| Python study | Pyodide, in-worker | `worker/study-runner.ts` driving `@local/petrinaut-optimizer-core` |

The capability queues runs, keeps one event log per run and answers each
`evaluate` message by calling `channel.evaluateTrial`. The worker loads Pyodide
from `pyodide.indexURL` (jsDelivr by default), installs the packages pinned in
`runtime-lock.json` with micropip, writes the Python sources from
`python-sources.ts` into Pyodide's filesystem and pairs each evaluate request
with the study loop. The Python study asks Optuna for values, awaits the
worker's evaluate callback and tells the outcome back.

## Segments

A run advances in segments. `start` runs the manifest's trial count on a new
study; `extend` runs more trials on the kept study, numbering onwards. Each
segment begins with a `started` event in the run log and ends with a terminal
`complete` or `error` event.

```text
queued ──worker ready──▶ running ──complete / cancelled──▶ finished-resumable
  │                        │                                     │
  │ cancel (first run)     │ trial evaluation failed,            │ extend
  │                        │ study error, worker error           ▼
  ▼                        ▼                                   queued
finished ◀──────────── finished                                (again)
                          ▲
                          └── release, from any status
```

`queued` waits for the worker to take the segment, `running` has it posted,
`finished-resumable` ended a segment with the study kept in the worker, and
`finished` has no study to return to. Runs execute one at a time on a shared
worker.

## Who owns what

- **Cancellation** is the capability's. `cancelOptimizationRun` aborts the
  segment's signal so the channel stops the trial's runs, and posts `cancel`;
  the worker resolves the segment's pending evaluations as pruned and the
  Python loop tells the trials in flight as failed without reporting them, then
  returns early. The capability appends the cancelled error event when the
  worker confirms with `cancelled`.
- **Trial numbering** is the study runner's. Optuna numbers trials densely in
  ask order and every ask leads to one evaluate call, so the count of evaluate
  calls made for a study is the next trial's number, across segments and across
  trials a stop left untold.
- **The trial cap** is the capability's, checked when a run is created or
  extended against `PETRINAUT_OPTIMIZATION_MAX_TRIALS` and the trials the log
  already holds. Python checks its own cap for `handle.requested`.
- **`requestedTrials`** is the capability's. It appends `started` with the
  cumulative total it computed; the Python summary reports its own count in
  `complete`.
- **Parallelism** is fixed when the study is created and every extension
  inherits it.
