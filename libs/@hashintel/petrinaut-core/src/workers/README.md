---
layer: core.workers
role: The module entry points hosts instantiate as Web Workers
---

# Worker entry points

One file per worker the host can spawn. Each is a thin entry point wiring a
message port to the runtime that does the work, holding no logic of its own, so
the runtimes stay testable on the main thread.

| Entry point      | Runtime it hosts                    |
| ---------------- | ----------------------------------- |
| `lsp.ts`         | the language server                 |
| `simulation.ts`  | frame computation for a single run  |
| `monte-carlo.ts` | batched runs reporting only metrics |
| `optimizer.ts`   | the Optuna study, in Pyodide        |

Separate export subpaths rather than one worker, so a host pays only for the
threads it uses — an editor with no experiments open never loads the Monte
Carlo runtime.
