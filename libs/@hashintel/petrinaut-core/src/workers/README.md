---
layer: core.workers
name: Worker entry points
role: The module entry points hosts instantiate as Web Workers
seams:
  - "@hashintel/petrinaut-core/workers/lsp"
  - "@hashintel/petrinaut-core/workers/monte-carlo"
  - "@hashintel/petrinaut-core/workers/simulation"
boundaries:
  - kind: worker
    note: Each file here is the top of a separate thread; only structured-cloneable messages cross
---

# Worker entry points

One file per worker the host can spawn. Each is a thin entry point: it wires the
worker's message port to the runtime that does the work and holds no logic of its
own, so the runtimes stay testable on the main thread.

| Entry point      | Runtime it hosts                    |
| ---------------- | ----------------------------------- |
| `lsp.ts`         | the language server                 |
| `simulation.ts`  | frame computation for a single run  |
| `monte-carlo.ts` | batched runs reporting only metrics |

These are separate export subpaths rather than one worker because a host should
pay for only the threads it uses — an editor with no experiments open never loads
the Monte Carlo runtime.
