# 05 — Simulation patterns (locked)

The simulator and the simulation worker live in `/core`. The patterns below isolate the engine from how it runs, so non-browser consumers can use it and bundling concerns stay out of `/core`.

## 5.1 Pluggable transport

The pure engine (`simulation/simulator/*`) is one thing; the worker that runs it off-thread is another. A `SimulationTransport` interface decouples them:

```ts
interface SimulationTransport {
  send(message: ToWorkerMessage): void;
  onMessage(listener: (m: ToMainMessage) => void): () => void;
  terminate(): void;
}

// shipped in /core
createWorkerTransport(createWorker: () => Worker): SimulationTransport;
createInlineTransport(): SimulationTransport; // runs the engine on the calling thread
```

Default transport: worker (via `createWorkerTransport`). Inline transport is opt-in for tests, headless CI, server-side runs, and replay.

## 5.2 Worker bundling — caller-provided factory (Option A)

`/core` does **not** import the worker via Vite-specific syntax. Consumers pass a `Worker` factory:

```ts
import { createPetrinaut } from "@hashintel/petrinaut/core";

const instance = createPetrinaut({
  document: { mode: "external", /* … */ },
  simulation: {
    createWorker: () =>
      new Worker(
        new URL("@hashintel/petrinaut/core/simulation.worker", import.meta.url),
        { type: "module" },
      ),
  },
});
```

The worker source is exposed as a sub-entry of the package (`./core/simulation.worker`) so the consumer's bundler resolves it via `new URL(..., import.meta.url)`. This works in Vite, Webpack, Rolldown, esbuild, and Bun without `/core` itself reaching for any bundler-specific syntax.

`/ui`'s `<Petrinaut>` provides a sensible default factory pointing at the same sub-entry, so most consumers don't have to think about this. Advanced consumers (Node `worker_threads`, custom worker pools, polyfills) override it.

## 5.3 Lazy spin-up via `startSimulation()`

The worker is **not** booted in `createPetrinaut()`. Headless consumers that only mutate a definition shouldn't pay the cost. Instead:

```ts
const sim = await instance.startSimulation({
  initialMarking,
  parameterValues,
  seed: 42,
  dt: 0.01,
  maxTime: 100,
  backpressure: { maxFramesAhead: 40, batchSize: 10 },
  signal: abortController.signal, // optional
});

sim.run();
const off = sim.frames.subscribe(({ latest }) => recordFrame(latest));
```

`instance.simulation` is a getter that returns the active `Simulation | null`. `startSimulation()` replaces any existing one (after disposing it).

## 5.4 Stream outputs, imperative inputs

```ts
type Simulation = {
  // outputs (subscribe-and-read)
  status: ReadableStore<SimulationState>;
  frames: ReadableStore<{ count: number; latest: SimulationFrame | null }>;
  events: EventStream<{ type: "complete" | "error"; reason?: string; itemId?: string | null }>;

  // inputs (imperative)
  run(): void;
  pause(): void;
  reset(): void;
  getFrame(index: number): SimulationFrame | null;
  ack(frameNumber: number): void;
  setBackpressure(cfg: BackpressureConfig): void;

  // lifecycle
  dispose(): void;
};
```

`frames` deliberately exposes only `{count, latest}` so subscribers don't re-render per frame; individual frames are pulled via `getFrame(i)`. Same approach `PlaybackProvider` already uses today.

## 5.5 Disposal & cancellation

- `startSimulation({ signal })` aborts worker init and frame streaming if the signal fires.
- `sim.dispose()` is the synchronous variant; idempotent.
- `instance.dispose()` chains to the active simulation.

## 5.6 Recording / replay falls out for free

Because frames are a stream, persisting a run is `sim.frames.subscribe(({latest}) => store.push(latest))`. Replay is `createInlineTransport()` (or a `createRecordedTransport(frames)`) fed pre-recorded frames — useful for deterministic tests, snapshots, time-travel debugging, no extra API.

## 5.7 `/react` shape

`SimulationProvider` becomes a ~30-line bridge: read `instance.simulation` from `PetrinautInstanceContext`, expose its stores as React state via `useSyncExternalStore`, and republish through the existing `SimulationContext` so `/ui` doesn't change. `useSimulationStatus()` / `useSimulationFrames()` hooks live here.
