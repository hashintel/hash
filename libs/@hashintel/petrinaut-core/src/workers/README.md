---
layer: core.workers
role: The module entry points hosts instantiate as Web Workers
---

# Worker entry points

One file per worker a host can start. Each re-exports the factory that
creates the worker and the types of its messages, and holds no logic of its
own, so the runtimes stay testable on the main thread.

| Entry point           | Worker it creates                                | Protocol                                                                            |
| --------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `lsp.ts`              | The language server                              | [Language worker protocol](doc:core.lsp.worker/protocol)                            |
| `event-simulation.ts` | One run recorded as events, for Quick Simulation | [Event worker protocol and demand](doc:core.simulation.event-trace.worker/protocol) |
| `monte-carlo.ts`      | A shard of an experiment, reporting metrics only | [Monte Carlo worker protocol](doc:core.simulation.monte-carlo.worker/protocol)      |
| `simulation.ts`       | The frames of one run, for `createSimulation`    | [Worker protocol and backpressure](doc:core.simulation.worker/protocol)             |

The package publishes each file as an entry of its own,
`@hashintel/petrinaut-core/workers/<name>`. A host then loads only the workers
it starts: an editor with no experiment open never loads the Monte Carlo
runtime.

The optimizer has a fifth worker, which this folder does not export.
`createBrowserOptimization` of `@hashintel/petrinaut-core/browser-optimization`
creates it, as [The browser runtime](doc:core.optimization.browser/browser-runtime)
describes.
