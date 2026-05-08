# Simulation Module

Headless SDCPN simulation runtime.

## Overview

The simulation module exposes the core `createSimulation` factory and the
transport protocol used to run SDCPN simulations off the main thread. It has no
UI-framework dependency.

`createSimulation` runs against an immutable SDCPN snapshot. After
initialization, later document mutations do not affect the active simulation.

## Simulation State

```typescript
type SimulationState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Paused"
  | "Complete"
  | "Error";
```

| State          | Description                                           |
| -------------- | ----------------------------------------------------- |
| `Initializing` | Worker or transport is booting and compiling the run. |
| `Ready`        | Simulation is initialized and ready to run.           |
| `Running`      | Frames are being computed.                            |
| `Paused`       | Computation is paused; frame history is retained.     |
| `Complete`     | Simulation ended because of deadlock or max time.     |
| `Error`        | Initialization or computation failed.                 |

## Configuration

| Property          | Description                                        |
| ----------------- | -------------------------------------------------- |
| `sdcpn`           | SDCPN snapshot to simulate.                        |
| `initialMarking`  | Initial token placement.                           |
| `parameterValues` | Parameter values overriding SDCPN defaults.        |
| `seed`            | Seed for deterministic stochastic behavior.        |
| `dt`              | Time step in seconds.                              |
| `maxTime`         | Maximum simulation time. `null` disables it.       |
| `backpressure`    | Optional worker frame-ahead and batch settings.    |
| `signal`          | Optional abort signal for initialization/teardown. |

Provide exactly one execution transport:

- `createWorker`: a factory returning a `Worker` or `Promise<Worker>`.
- `transport`: a pre-built `SimulationTransport`.

## Lifecycle

```text
                    ┌──────────────┐
                    │ Initializing │
                    └──────┬───────┘
                           │ worker ready
                           ▼
                    ┌──────────────┐
             ┌─────►│    Ready     │◄─────┐
             │      └──────┬───────┘      │
             │             │ run()        │ pause()
             │             ▼              │
             │      ┌──────────────┐      │
             │      │   Running    │──────┘
             │      └──────┬───────┘
             │             │
             │ deadlock / maxTime / error
             │             │
             │             ▼
             │      ┌──────────────┐
             └──────│ Complete or  │
                    │    Error     │
                    └──────────────┘
```

## API

- `createSimulation(config)`: initialize a simulation and resolve a live
  `Simulation` handle once the worker reports ready.
- `simulation.status`: readable store containing the current
  `SimulationState`.
- `simulation.frames`: readable store containing `{ count, latest }`.
- `simulation.events`: event stream for completion and runtime errors.
- `simulation.run()` / `simulation.pause()` / `simulation.reset()`: control
  computation.
- `simulation.getFrame(index)`: read a computed frame by index.
- `simulation.ack(frameNumber)`: acknowledge consumed frames for worker
  backpressure.
- `simulation.setBackpressure(config)`: update worker frame-ahead and batch
  settings.
- `simulation.dispose()`: stop and terminate the underlying transport.

## Usage

```ts
import { createSimulation } from "@hashintel/petrinaut/core";

const simulation = await createSimulation({
  sdcpn,
  initialMarking,
  parameterValues,
  seed: 42,
  dt: 0.01,
  maxTime: null,
  backpressure: {
    maxFramesAhead: 100,
    batchSize: 50,
  },
  createWorker: () =>
    new Worker(new URL("./simulation.worker.js", import.meta.url)),
});

const unsubscribe = simulation.frames.subscribe(({ count, latest }) => {
  if (latest) {
    console.log(`Computed ${count} frames; latest time is ${latest.time}`);
  }
});

simulation.ack(0);
simulation.run();

// Later:
unsubscribe();
simulation.dispose();
```
