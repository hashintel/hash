# Architecture — React integration with the simulation core

How `@hashintel/petrinaut`'s React layer consumes the headless simulation
runtime from `@hashintel/petrinaut-core`. The core's architecture (engine,
frame format, worker protocol, Monte Carlo) is documented in the architecture
docs, which #9206 adds a site for, and this page
covers only the React side of the boundary.

> This file is internal engineering documentation. It deliberately does NOT
> live in `docs/` — that folder is the end-user guide, consumed at runtime by
> the in-app AI assistant.

## Quick Simulation

### SimulatorsProvider (`src/react/simulators/`)

- Registers the built-in simulators (JS fixed step, JS adaptive, WebGPU
  fixed step) and whatever the host adds, with the worker factories the host
  supplies. Their experiments lease workers from one pool.
- Publishes the registrations and the selection each mode starts a session
  on.

### SimulationProvider (`src/react/simulation/`)

- Owns the run configuration as React state: `initialMarking`
  (`Record<placeId, TokenRecord[] | number>` — keyed by place **ID**; a
  number is an uncoloured token count, and the records inside are keyed by
  element name), parameter values, the mode (one run, or many), the
  simulator picked in each mode with its parameter values, and
  `maxTime` (`number | null`; null = unbounded run). When a scenario is
  compiled, its marking and parameter overrides
  take effect over the base state.
- `initialize({ seed })` assesses the selected simulator and starts what the
  mode computes: a run (`EventSimulation`) in Quick mode, an experiment
  (`MonteCarloExperiment`) in Stochastic mode. The handle's status is
  mirrored into context via a `useStore` subscription.
- Exposes `getFrame(index)` / `getFramesInRange(...)` over the run's recorded
  events, and `playbackSource`: the coverage, status and `demand(time)` that
  playback moves over, whichever mode computed it.
- `initialMarking` is session state — it is configuration for the _next_ run
  and survives `reset()`.

### EventPlaybackProvider (`src/react/event-playback/`)

- Drives the viewed **time** with a `requestAnimationFrame` loop calling the
  core `createEventPlayback` model's `tick()` (speed, covered time,
  done-flag). The viewed time lives in a store, so a frame of playback
  renders only what shows it.
- Flow control is by time: the provider demands `viewed time + lead` from
  the playback source, and the lead depends on the play mode:
  - `viewOnly` — pauses the run and demands nothing: nothing new is computed.
  - `computeBuffer` — a short lead ahead of the playhead.
  - `computeMax` — computes as far ahead as the run goes.

### ExecutionFrameSource (`src/react/execution-frame/`)

An abstraction over "where frames come from" so canvas and timeline
components work identically for a run's playback and Actual-mode recordings.
For a run, a frame is a recorded event and the viewed frame is the state at
the viewed time:
`{ totalFrames, currentFrameIndex, currentFrameReader, scrubToFrame, getFramesInRange }`.

### Who reads what

| Consumer                                     | Reader call                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Canvas transitions                           | `getTransitionState(id)` — `firedInThisFrame`, `timeSinceLastFiringMs`, `firingCount`                         |
| Place state visualization (user visualizers) | `getPlaceTokens(place)` → typed `TokenRecord[]`                                                               |
| Timeline (per-place / per-transition series) | `getPlaceTokenCount(id)` / `getTransitionState(id)`                                                           |
| Initial-state editor                         | `getPlaceTokens` during a run; the provider's `initialMarking` otherwise                                      |
| Metrics (timeline)                           | compiled metric fn against `buildMetricState(reader, places, types)` — evaluated on the main thread per frame |

User place visualizers lower to the view HIR in core and are rendered in
this package (`src/ui/lib/render-visualizer-hir.ts` interprets the tree into
React elements) — the one authoring surface that is inherently React (users
write JSX).

## Experiments (Monte Carlo)

### ExperimentsProvider (`src/react/experiments/`)

- One `ExperimentRecord` per experiment: config (`runCount`, seed, `dt`,
  `maxTime`, metric specs), the label of the simulator that computes it,
  `status`, `progress` (`MonteCarloWorkerProgress`), `metricFrames`,
  `latestMetricFramesById`.
- Starts each experiment on a registered simulator: the one the input names,
  or the default Stochastic one. The provider holds no workers of its own;
  the simulators lease them from the pool of `SimulatorsProvider`. It mirrors
  the handle's `status` / `progress` / `metrics` stores, and the accumulated
  metric frames stay for display once the run is over.
- `adoptExperiment` lists an experiment something else started, which is how
  a Stochastic simulation is kept.

### ExperimentMetricTimeline (`src/ui/.../experiments/`)

Renders metric frames with uPlot; three views per metric:

- **chart** — per-frame series from scalar frames (`frameValue`).
- **number** — a single time-aggregated scalar (`timeValue` or a main-thread
  aggregation over frames: mean/min/max/sum).
- **distribution** — histogram of per-run values from `bins`.

Distribution frames keep the run axis (`bins: [value, frequency][]`): the
timeline paints a bins × frames heatmap (opacity ∝ frequency) and derives run
aggregations — mean, median, min, max, p10/p25/p75/p90 — from the bins on the
main thread. Clicking a frame opens a popover with that frame's scalar or
histogram. Frame buffers never reach this layer; everything renders from the
small JSON metric frames.

## Dev tooling

The **token encoding playground** (`src/ui/dev/token-encoding-playground/`,
Storybook: _Dev / Token Encoding Playground_) visualizes the core's packed
token layout bit-by-bit; it reuses `computeTokenSlotLayout` and the token
value codec from the core, and scopes Monaco's built-in TypeScript service to
its own mount so it never shadows the SDCPN LSP.
