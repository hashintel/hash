# 05 — Simulation patterns (locked)

The simulator and the simulation worker live in `/core`. Simulations are **standalone** — they don't live on a `Petrinaut` instance because they only need a frozen SDCPN snapshot to run. The patterns below isolate the engine from how it runs, so non-browser consumers can use it and bundling concerns stay out of `/core`.

## 5.1 Standalone, not instance-owned

A simulation operates on a frozen SDCPN snapshot taken at start time. After that, it has no relationship with the live document — mutations don't affect a running simulation, and the simulation can outlive any `Petrinaut` instance.

So the entry point is a top-level function, **not** a method on the instance:

```ts
import { createSimulation } from "@hashintel/petrinaut/core";

const sim = await createSimulation({
  sdcpn: someSDCPN,                    // frozen snapshot
  initialMarking: new Map(),
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 10,
  createWorker: () => new Worker(/* … */),
});
```

If you have a `Petrinaut` instance (for live editing), pass `instance.handle.doc()`. If you don't, pass any SDCPN value — it works the same. Multiple simulations can coexist against one document (parameter sweeps, scenario comparison) because each owns its own snapshot and worker.

The host owns the resulting `Simulation` handle and its lifecycle; disposing the source `Petrinaut` instance does **not** dispose its simulations.

## 5.2 Pluggable transport

The pure engine (`simulation/simulator/*`) is one thing; the worker that runs it off-thread is another. A `SimulationTransport` interface decouples them:

```ts
interface SimulationTransport {
  send(message: ToWorkerMessage): void;
  onMessage(listener: (m: ToMainMessage) => void): () => void;
  terminate(): void;
}

// shipped in /core
createWorkerTransport(createWorker: () => Worker | Promise<Worker>): SimulationTransport;
createInlineTransport(): SimulationTransport; // 🟡 planned — runs the engine on the calling thread
```

`createSimulation` accepts either a `createWorker` factory (it builds the transport) or a pre-built `transport`:

```ts
type CreateSimulationConfig = SimulationConfig &
  (
    | { createWorker: WorkerFactory; transport?: never }
    | { transport: SimulationTransport; createWorker?: never }
  );
```

When you pass a `transport`, ownership transfers to the simulation — `simulation.dispose()` calls `transport.terminate()`. Build a fresh transport per simulation.

## 5.3 Worker bundling — caller-provided factory (Option A)

`/core` does **not** import the worker via Vite-specific syntax. Consumers pass a `Worker` factory:

```ts
import { createSimulation } from "@hashintel/petrinaut/core";

const sim = await createSimulation({
  sdcpn: net,
  initialMarking: new Map(),
  parameterValues: {},
  seed: 42,
  dt: 0.01,
  maxTime: 10,
  createWorker: () =>
    new Worker(
      new URL("@hashintel/petrinaut/core/simulation.worker", import.meta.url),
      { type: "module" },
    ),
});
```

The worker source is exposed as a sub-entry of the package (`./core/simulation.worker`) so the consumer's bundler resolves it via `new URL(..., import.meta.url)`. This works in Vite, Webpack, Rolldown, esbuild, and Bun without `/core` itself reaching for any bundler-specific syntax.

`/ui`'s `<Petrinaut>` will provide a sensible default factory pointing at the same sub-entry, so most consumers don't have to think about this. Advanced consumers (Node `worker_threads`, custom worker pools, polyfills) override it.

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

- `createSimulation({ ..., signal })` aborts worker init and frame streaming if the signal fires before init completes; the partial transport is torn down.
- `sim.dispose()` is the synchronous variant; idempotent.
- The host owns the lifecycle — Core does not chain disposal from a `Petrinaut` instance.

## 5.6 Recording / replay falls out for free

Because frames are a stream, persisting a run is `sim.frames.subscribe(({latest}) => store.push(latest))`. Replay is `createInlineTransport()` (or a `createRecordedTransport(frames)`) fed pre-recorded frames — useful for deterministic tests, snapshots, time-travel debugging, no extra API.

## 5.7 `/react` shape

`SimulationProvider` becomes a ~30-line bridge: hold a `Simulation | null` in React state, expose its stores via `useSyncExternalStore`, and republish through the existing `SimulationContext` so `/ui` doesn't change. `useSimulationStatus()` / `useSimulationFrames()` hooks live here.

The provider also owns "setup state" (parameter values, initial marking, scenarios, etc.) as plain React state — these are inputs to `createSimulation`, not Core concerns. When the user clicks "run," the provider:

1. Disposes the previous simulation, if any.
2. Calls `createSimulation({ sdcpn, ...setupState, createWorker })`.
3. Stores the resulting handle and forwards control calls to it.

## 5.8 Phase 2a spike — landed

A first cut of the patterns above ships in `src/core/simulation/`:

- `transport.ts` — `SimulationTransport` interface and `createWorkerTransport(createWorker)`. Accepts a sync or async `Worker` factory; messages sent before the worker is ready are queued and flushed on boot.
- `simulation.ts` — `createSimulation(config)` returning a `Simulation` handle (`status` + `frames` + `events` stores; `run`/`pause`/`reset`/`ack`/`setBackpressure`/`getFrame`/`dispose` actions). Accepts either `createWorker` or `transport` per call. Resolves on `ready`; rejects on init `error` or `AbortSignal` abort. `dispose()` is idempotent and tears down the transport.
- `index.ts` — barrel for `/core/simulation`.

Decoupling: `createPetrinaut` does **not** take a simulation config. The instance has no `simulation` field. Consumers who want to run a simulation call `createSimulation` directly with whatever SDCPN they have. This keeps the instance surface narrow, supports multiple simulations per document, and makes pure-headless simulation a one-import operation.

`createInlineTransport()` is **not yet implemented** — Phase 3 / follow-up. The `SimulationTransport` interface is designed to admit it without the rest of the API changing.

`/react` and `/ui` are **not yet wired** to use `createSimulation`. The existing `<SimulationProvider>` still drives `<Petrinaut>`'s simulation panel via `useSimulationWorker`. That swap is the next step (and the part that lets us delete the old `useSimulationWorker` hook).

8 unit tests cover both flavours: ready/init via mock transport, init error, single + batch frame appends, complete event, control message round-trip, idempotent dispose, abort during init, plus a fake-`Worker` test for the `createWorker` factory route.
