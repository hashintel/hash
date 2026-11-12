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
entry wraps `self` and lives with the simulators it hosts
(`simulators/worker/experiment.worker.ts`), and `in-process-worker.ts` wraps
a plain callback pair for
hosts without a thread primitive — unit tests, or a runtime whose worker entry
file is unavailable. The in-process worker still yields through `setTimeout`,
so the calling thread is shared rather than blocked, but nothing runs in
parallel: it is the correctness fallback, not the fast path.

`messages.ts` defines the message types both sides exchange.

A shard advances its runs with the fixed-step engine unless the experiment
names another simulator. `attach.ts` then asks its host for that simulator's
run drivers (`../run-driver.ts`): the simulator still decides which runs
exist, when they are sampled and what the metrics read, and a driver decides
how a run gets from one sample time to the next. A worker whose host supplies
no drivers refuses such an experiment.
