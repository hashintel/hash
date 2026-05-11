# Simulation Architecture

The simulation module is split into five boundaries:

- `api.ts` defines the public Core contract. Consumers receive
  `SimulationFrameReader` and summary state, not engine storage objects.
- `authoring/metric/`, `authoring/scenario/`, and `authoring/user-code/`
  compile user-authored inputs. Shared same-realm hardening helpers live in
  `authoring/sandbox.ts`.
- `engine/` builds SDCPN definitions into runnable state and advances internal
  `EngineFrame` state. This code may use mutable/compact structures optimized
  for stepping.
- `worker/` owns the transport protocol between the engine worker and runtime.
  Worker messages use protocol payloads such as `SimulationFramePayload`, not
  engine types directly.
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

`EngineFrame` is not a public API or stable storage format. It currently uses
records keyed by IDs and a shared `Float64Array` for token values. Simulation
time is owned by the run controller and kept outside `EngineFrame` and
`SimulationFrameReader`. Future binary work should happen behind the worker
payload and frame-store boundaries so UI and React consumers keep using the same
reader interface.

Retention is intentionally isolated in `runtime/frame-store.ts`. The current
store keeps every full frame in memory for compatibility. Future stores can keep
only the latest frame, a sliding window, aggregate chunks, or persisted binary
payloads without changing the public simulation handle.
