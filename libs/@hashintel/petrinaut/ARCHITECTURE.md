# Architecture — React integration with the simulation core

How `@hashintel/petrinaut`'s React layer consumes the headless simulation
runtime from `@hashintel/petrinaut-core`. The core's architecture (engine,
frame format, worker protocol, Monte Carlo) is documented in
[`petrinaut-core/docs/architecture/`](../petrinaut-core/docs/architecture/index.html)
— this page covers only the React side of the boundary.

> This file is internal engineering documentation. It deliberately does NOT
> live in `docs/` — that folder is the end-user guide, consumed at runtime by
> the in-app AI assistant.

## Quick Simulation

### SimulationProvider (`src/react/simulation/`)

- Owns the run configuration as React state: `initialMarking`
  (`Record<placeId, TokenRecord[] | number>` — keyed by place **ID**; a
  number is an uncoloured token count, and the records inside are keyed by
  element name), parameter values, seed, `dt`,
  `maxTime` (`number | null`; null = unbounded run). When a scenario is
  compiled, its marking and parameter overrides
  take effect over the base state.
- Calls `createSimulation()` from the core with the browser worker factory,
  then mirrors the handle's `status` and `frames` stores into context via a
  `useStore` subscription.
- Exposes `getFrame(index)` / `getFramesInRange(...)`, `ack(frameNumber)`,
  and `setBackpressure(...)` to downstream consumers.
- `initialMarking` is session state — it is configuration for the _next_ run
  and survives `reset()`.

### PlaybackProvider (`src/react/playback/`)

- Drives the viewed frame with a `requestAnimationFrame` loop calling the
  core `playback` module's `tick()` (speed, dt, total frames, done-flag).
- On `frameIndex` change, fetches `getFrame(frameIndex)` and publishes the
  resulting `SimulationFrameReader` as `currentFrameReader`.
- Implements the ack policy per play mode (the core's
  `getPlayModeBackpressure` defines profiles for the compute modes only):
  - `viewOnly` — pauses the worker and never acks: nothing new is computed.
  - `computeBuffer` — acks when playback is within ~0.5 s of the last
    computed frame: keeps a small rolling buffer ahead of the playhead.
  - `computeMax` — acks on every arrival: compute as fast as possible.

### ExecutionFrameSource (`src/react/execution-frame/`)

An abstraction over "where frames come from" so canvas and timeline
components work identically for live playback and Actual-mode recordings:
`{ totalFrames, currentFrameIndex, currentFrameReader, scrubToFrame, getFramesInRange }`.

### Who reads what

| Consumer                                     | Reader call                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Canvas transitions                           | `getTransitionState(id)` — `firedInThisFrame`, `timeSinceLastFiringMs`, `firingCount`                         |
| Place state visualization (user visualizers) | `getPlaceTokens(place)` → typed `TokenRecord[]`                                                               |
| Timeline (per-place / per-transition series) | `getPlaceTokenCount(id)` / `getTransitionState(id)`                                                           |
| Initial-state editor                         | `getPlaceTokens` during a run; the provider's `initialMarking` otherwise                                      |
| Metrics (timeline)                           | compiled metric fn against `buildMetricState(reader, places, types)` — evaluated on the main thread per frame |

User place visualizers are compiled in this package
(`src/ui/lib/compile-visualizer.ts`, Babel + classic React runtime) — the one
authoring surface that is inherently React (users write JSX).

## Experiments (Monte Carlo)

### ExperimentsProvider (`src/react/experiments/`)

- One `ExperimentRecord` per experiment: config (`runCount`, seed, `dt`,
  `maxTime`, metric specs), `status`, `progress`
  (`MonteCarloWorkerProgress`), `metricFrames`, `latestMetricFramesById`.
- Creates a `MonteCarloExperiment` handle per record
  (`createMonteCarloExperiment` + the Monte Carlo worker factory) and mirrors
  its `status` / `progress` / `metrics` stores. On completion the worker is
  disposed; the accumulated metric frames stay for display.

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
