# RFC 0002 — Petrinaut: Simulation Engine v2

**Status:** Draft
**Authors:** @cf
**Created:** 2026-05-08
**Last updated:** 2026-05-08
**Tracking issue:** FE-666

---

## Summary

Rework Petrinaut simulation so the worker is fast, memory-efficient, stable to
talk to, and capable of running much longer simulations than the current
frame-history model allows.

The current implementation is useful for playback, but it couples the simulator
to full-frame retention, exposes buffer layout through the public API, and makes
the worker protocol depend on streaming complete `SimulationFrame` objects. This
RFC proposes separating simulation stepping, storage, and presentation.

## Objectives

- Make simulation faster and reduce memory footprint.
- Keep the worker's internal simulation representation binary-first and compact.
- Avoid JSON/object wrappers inside hot simulation state.
- Stop exposing internal in-memory or storage representation through public
  simulator interfaces.
- Make the communication protocol more stable and versionable.
- Allow many more frames to be computed by writing chunks to storage and keeping
  only a current in-memory window.
- Keep all protocol messages JSON-communicable: no `Map`, class instances, or
  non-serializable values in message shapes.
- Support stochastic simulation properly in future: deterministic seeding,
  reproducible sampling, and efficient multi-run/ensemble modes.
- Allow a mode that runs every frame through a single reusable buffer when
  frame history is not needed.

## Non-Goals For This Draft

- Final storage schema.
- Final browser persistence implementation.
- Full experiment UI design.
- Rewriting the SDCPN authoring model.
- Choosing every binary layout detail up front.

## Current Problems

### Full Frame History Is Hard-Coded

The low-level `SimulationInstance` stores `frames: SimulationFrame[]`, and
`computeNextFrame` appends a new frame on every step. The public
`createSimulation` handle also stores all received frames. This duplicates
memory and makes memory use grow with simulation duration.

This shape prevents efficient modes like:

- compute and discard;
- keep latest frame only;
- keep a sliding playback window;
- stream aggregate chunks to storage;
- run many stochastic replications in parallel.

### Public API Leaks Internal Layout

`SimulationFrame` exposes place offsets, dimensions, and a shared
`Float64Array` buffer. That is an internal storage layout, but it is currently
part of the consumer contract.

Consumers should ask for domain-level outputs: frame metadata, place token
counts, aggregate series, final marking, or a decoded token view. They should
not need to know the engine's buffer layout.

### Static Model Data Is Repeated Per Frame

Transition frame state currently includes the transition `instance`. Static
SDCPN model data should live outside frame payloads. Per-frame state should only
contain values that change over time.

### Worker Protocol Is Too Playback-Shaped

The protocol primarily sends `frame` and `frames` messages. It lacks concepts
for output mode, run identity, protocol version, aggregate chunks, storage
checkpoints, final-frame-only output, or multiple simulations running through
one coordinator.

### `ready` Is Ambiguous

The worker currently uses a `ready` message both for worker boot and simulation
initialization. These should be separate protocol events, preferably tied to a
run id.

### Backpressure Is Too Low-Level

`ack(frameNumber)` assumes frame playback. For persistence-heavy or
aggregate-only runs, the useful acknowledgement may be "chunk persisted" or
"window consumed." Backpressure should be expressed in terms of the chosen
output sink.

### `reset()` Semantics Are Confusing

The public `reset()` sends `stop`, clears local frames, and sets status to
`Ready`, but the worker has discarded the simulation. The API should distinguish
stop/dispose/reinitialize clearly.

### Status And Error State Are Split

`status` is a store, but error details and completion reason are one-shot
events. Late subscribers cannot recover the current error or completion
metadata. A single snapshot store would be easier to consume safely.

## Proposed Direction

### 1. Separate Engine State From Retention

The simulator should advance from the current state to the next state without
owning a history array.

Conceptually:

```ts
type StepResult = {
  frameNumber: number;
  time: number;
  completionReason: "deadlock" | "maxTime" | null;
};

step(engineState): StepResult;
```

The engine can keep current binary state internally. History retention becomes
a policy outside the hot stepping path.

### 2. Add Explicit Output Policies

Simulation creation should declare what outputs are produced and retained.

Example shape:

```ts
type SimulationOutputPolicy =
  | { kind: "none" }
  | { kind: "latestFrame" }
  | { kind: "frameWindow"; maxFrames: number }
  | { kind: "frameChunks"; chunkSize: number }
  | { kind: "placeTokenCounts"; chunkSize: number }
  | { kind: "placeTokenMeans"; chunkSize: number };
```

This avoids pretending every consumer wants full frames forever.

### 3. Make Protocol Messages Versioned And JSON-Communicable

All protocol messages should be plain JSON-compatible objects plus transferable
binary payloads when needed.

No `Map`, class instances, function values, or object graphs that depend on
prototype behavior.

Example:

```ts
type SimulationProtocolMessage = {
  protocolVersion: 2;
  runId: string;
  type: string;
};
```

Binary data should be carried in `ArrayBuffer`/typed-array payloads with a
documented layout. Message metadata should describe the layout rather than
requiring consumers to infer it from engine internals.

### 4. Separate Public Domain Views From Internal Binary Layout

The worker may use compact typed arrays internally, but public APIs should
expose stable domain-oriented views.

Potential public surfaces:

- `getLatestFrame()`
- `getFrameWindow()`
- `getFinalFrame()`
- `subscribeToSeries()`
- `readChunk(chunkId)`
- `getRunSnapshot()`

These should not expose the internal memory layout used by the stepping engine.

### 5. Support Storage Sinks

Long simulations should be able to write chunks to storage while retaining only
a small window in memory.

The likely browser shape:

- IndexedDB for run metadata and chunk indexes.
- IndexedDB or OPFS for binary chunk payloads.
- Worker-owned chunk production.
- Host-owned persistence acknowledgement.

The simulation should be able to continue after a chunk has been persisted and
acknowledged, without retaining the full history in memory.

### 6. Prepare For Stochastic Experiments

The v2 interface should make stochastic simulation a first-class future path.

Needed foundations:

- explicit base seed;
- deterministic per-run seed derivation;
- reproducible random sampling from engine state;
- output modes that aggregate across replications;
- single-buffer stepping for runs where only aggregates or final frame matter;
- enough metadata to replay or audit a run.

This does not require implementing ensemble simulation immediately, but the
protocol and engine boundaries should not block it.

## Sketch: Simulation v2 Handle

```ts
type SimulationSnapshot = {
  runId: string;
  status: "initializing" | "ready" | "running" | "paused" | "complete" | "error";
  frameNumber: number;
  time: number;
  error: { message: string; itemId: string | null } | null;
  completionReason: "deadlock" | "maxTime" | null;
};

interface SimulationV2 {
  readonly snapshot: ReadableStore<SimulationSnapshot>;
  readonly events: EventStream<SimulationEventV2>;

  start(this: void): void;
  pause(this: void): void;
  stop(this: void): void;
  dispose(this: void): void;

  acknowledge(this: void, ack: SimulationAck): void;
}
```

Open question: whether frame and chunk reads belong on the handle itself or on
a separate result store abstraction.

## Sketch: Worker Protocol v2

Message families:

- `worker.ready`
- `run.init`
- `run.ready`
- `run.start`
- `run.pause`
- `run.stop`
- `run.snapshot`
- `run.output.chunk`
- `run.output.finalFrame`
- `run.complete`
- `run.error`
- `run.ack`

Every message should include:

- `protocolVersion`
- `runId`
- `type`

Output chunks should include:

- frame range;
- time range;
- output kind;
- binary layout id;
- transferable buffers;
- chunk id for persistence acknowledgement.

## Migration Notes

- Keep the current playback UI working by implementing it as one output policy:
  a bounded frame window or all-frames mode during the transition.
- Introduce v2 protocol alongside v1 if needed, rather than silently changing
  message meanings.
- Move current full-frame history behavior behind an explicit compatibility
  option.
- Treat `reset()` as a breaking API point: rename to `stop()` or make it truly
  reinitialize.
- Avoid publishing internal engine types as public result types.

## Open Questions

- What is the default output policy for editor playback?
- Should storage be owned by the worker, the host, or an injected sink?
- Should the core package ship an IndexedDB/OPFS sink, or only define the sink
  interface?
- How large should frame/chunk windows be by default?
- Do aggregate outputs use `Float32Array` or `Float64Array`?
- How do we represent places and transitions in binary layouts while preserving
  stable IDs?
- Should ensemble/stochastic experiments be a separate API from single
  simulation playback?
- What protocol compatibility guarantees do we want for external consumers?
