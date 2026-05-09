# Simulation Architecture

The simulation module is split into four boundaries:

- `api.ts` defines the public Core contract. Consumers receive
  `SimulationFrameReader` and summary state, not engine storage objects.
- `authoring/engine/` compiles SDCPN definitions and advances internal
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
records keyed by IDs and a shared `Float64Array` for token values. Future binary
work should happen behind the worker payload and frame-store boundaries so UI
and React consumers keep using the same reader interface.

Retention is intentionally isolated in `runtime/frame-store.ts`. The current
store keeps every full frame in memory for compatibility. Future stores can keep
only the latest frame, a sliding window, aggregate chunks, or persisted binary
payloads without changing the public simulation handle.
