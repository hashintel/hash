---
layer: core.simulation
role: Executes SDCPN nets, with the contract the runtimes share, the engine, the frame format, the steppers and the runtimes
---

# Simulation

This folder executes a net. Its own files are the contract every runtime
shares, and each subfolder is a block with a layer of its own. Nothing here
depends on a UI framework.

A run works on a copy of the net taken when it starts, so a later edit of the
document does not reach it. Each runtime first removes from that copy what
the disabled extensions cover.
[Two execution paths](doc:two-execution-paths) says why a single run and an
experiment have a runtime each.

## What a run is built from

| Part          | Where                                         | What it holds                                                                                                                                           |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The contract  | `api.ts`                                      | The types a host sees whichever runtime computes: `SimulationState`, `InitialMarking`, `SimulationFrameReader`, `SimulationTransport`, `WorkerFactory`. |
| The transport | `worker-transport.ts`                         | Wraps a worker factory in a `SimulationTransport` that queues messages until the worker has booted.                                                     |
| Token values  | [`../tokens/`](layer:core.tokens)             | What a token attribute is in a document, in memory and packed in a buffer.                                                                              |
| The engine    | [`engine/`](layer:core.simulation.engine)     | `buildSimulation`, which every runtime calls to compile a net with its HIR artifacts, and `computeNextFrame`, the step of the compiled model.           |
| Frames        | [`frames/`](layer:core.simulation.frames)     | The layout of a frame buffer and the readers a host inspects one with. [Memory model](doc:core.simulation.frames/memory-model) has the format.          |
| Steppers      | [`steppers/`](layer:core.simulation.steppers) | How a run gets from one time to the next: a fixed step, an untimed step, or an error-controlled solver.                                                 |

`sdcpn-item-error.ts` holds the error that names the item of the net it
blames, which a runtime passes on as `itemId`.

## The runtimes

| Runtime                                          | Entry                                          | What it keeps                                                               | Who starts it                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Event trace](layer:core.simulation.event-trace) | `createEventSimulation` in `event-trace/`      | The states its stepper finds worth recording, read at any time between them | The editor's Quick Simulation and the preview's, through a simulator of [`core.simulators`](layer:core.simulators) |
| [Monte Carlo](layer:core.simulation.monte-carlo) | `createMonteCarloExperiment` in `monte-carlo/` | Two buffers per run, and metric aggregates on the host                      | The editor's experiments, through a backend of [`core.experiments`](layer:core.experiments)                        |

Each runtime talks to the worker that computes through messages. The
protocols are on pages of their own:
[event worker](doc:core.simulation.event-trace.worker/protocol) and
[Monte Carlo worker](doc:core.simulation.monte-carlo.worker/protocol).
[Worker sharding](doc:core.simulation.monte-carlo/worker-sharding) says how
an experiment splits its runs over several Monte Carlo workers.

`compilePetrinautModel` in `compiled-model.ts`, published as
`@hashintel/petrinaut-core/compiled-model`, runs a net in the calling thread
without a worker. It steps with `computeNextFrame` and keeps the latest
frame only.

## Where a run is advanced

The state of one run and the step that advances it sit in `monte-carlo/`,
and more than the Monte Carlo runtime uses them: `run-state.ts`,
`frame-buffer.ts`, `frame-operations.ts`, `transition-effect.ts` and
`advance-run.ts`. The fixed-step and untimed steppers advance a run with
`advanceRun`, and the adaptive stepper works on the same buffers. The event
worker reads a recorded state from those buffers, so the event trace imports
`monte-carlo/` too.

A change to the order of a fixed step is made in
`monte-carlo/advance-run.ts` for Quick Simulation and experiments, and in
`engine/compute-next-frame.ts` for the compiled model.
The adaptive stepper advances in `steppers/adaptive-stepper.ts`.
[How a step is computed](doc:core.simulation.engine/stepping) states the
order.

## States of a run

`SimulationState` is the status every single-run handle publishes:

| State          | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| `Initializing` | The worker is booting and building the run.                |
| `Ready`        | The run is built and has not started.                      |
| `Running`      | The worker computes as far as the host lets it.            |
| `Paused`       | Computation is paused, and what was computed is kept.      |
| `Complete`     | The run ended by deadlock or by reaching its maximum time. |
| `Error`        | Building or computing failed.                              |

`initialMarking` is keyed by place id. An uncoloured place takes a token
count, and a coloured place one record per token:

```ts
{
  susceptible: 100,
  infected: [{ age: 42, viralLoad: 0.8 }]
}
```
