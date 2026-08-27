---
layer: core.simulation.monte-carlo.worker
role: The shard-side worker protocol, detached from any particular thread host
---

# Monte Carlo worker

One shard is one worker running its own `MonteCarloSimulator` over a slice of
an experiment's runs, streaming per-frame metric states back to the runtime.

The protocol logic is host-agnostic: `attach.ts` implements it against a
`WorkerThreadRuntime` — post a message, receive messages, yield between
compute batches — so every host runs the same code. The editor's Web Worker
entry (`monte-carlo.worker.ts`) wraps `self`, the CLI's `worker_threads` entry
wraps `parentPort`, and `in-process-worker.ts` wraps a plain callback pair for
hosts without a thread primitive — unit tests, or a runtime whose worker entry
file is unavailable. The in-process worker still yields through `setTimeout`,
so the calling thread is shared rather than blocked, but nothing runs in
parallel: it is the correctness fallback, not the fast path.

`messages.ts` defines the message types both sides exchange, and
`create-monte-carlo-worker.ts` dynamically imports and instantiates the
browser worker entry.
