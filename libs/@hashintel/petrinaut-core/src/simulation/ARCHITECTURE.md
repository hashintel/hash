# Simulation Architecture

The simulation module is split into five boundaries:

- `api.ts` defines the public Core contract. Consumers receive
  `SimulationFrameReader` and summary state, not engine storage objects.
- `authoring/metric/`, `authoring/scenario/`, and `authoring/user-code/`
  compile user-authored inputs. Shared same-realm hardening helpers live in
  `authoring/sandbox.ts`.
- `engine/` builds SDCPN definitions into runnable state and advances internal
  `EngineFrame` state. `EngineFrame` is an `ArrayBuffer`; the
  SDCPN-specialized `EngineFrameLayout` lives on the `SimulationInstance`.
- `worker/` owns the transport protocol between the engine worker and runtime.
  Worker frame payloads carry binary frame buffers plus orchestration metadata
  such as time.
- `runtime/` owns lifecycle and retention. It stores protocol payloads through a
  `SimulationFrameStore` and returns `SimulationFrameReader` instances.

Current data flow:

```text
SDCPN snapshot
  -> buildSimulation()
  -> EngineFrame
  -> SimulationFramePayload
  -> SimulationFrameStore
  -> SimulationFrameReader
```

`EngineFrame` is not a public API or stable storage format. It is currently a
binary `ArrayBuffer` (header-stamped `FRAME_VERSION = 2`) with typed sections
for place token counts, per-place byte offsets, transition timers/counts/flags,
and a packed-struct token byte region. Each colour's token layout is computed
by `engine/token-layout.ts`: `real` and `integer` elements map to f64 (8 B,
8-aligned; integers rounded by the value codec), `boolean` elements map to u8
(1 B), fields are ordered by decreasing alignment, and the per-token stride is
rounded up to 8 bytes so f64 fields stay addressable through a shared
`Float64Array` view. A frame can only be read with the matching SDCPN-derived
layout.

The public frame path is:

```ts
const createReader = compileSimulationFrameReader(sdcpn);
const reader = createReader(engineFrame, frameNumber, frameTime);
```

Simulation time is owned by the run controller and kept outside `EngineFrame`.
Worker payloads carry it as frame metadata, and `SimulationFrameReader` exposes
it to consumers. Future storage work should happen behind the worker payload and
frame-store boundaries so UI and React consumers keep using the same reader
interface.

Retention is intentionally isolated in `runtime/frame-store.ts`. The current
store keeps every full frame in memory for compatibility. Future stores can keep
only the latest frame, a sliding window, aggregate chunks, or persisted binary
payloads without changing the public simulation handle.
