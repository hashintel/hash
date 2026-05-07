# Simulation Module

React context and provider for SDCPN simulation management.

## Overview

SimulationProvider wraps the WebWorker-based simulation and exposes it through React Context. It handles configuration, lifecycle, and frame access while the actual computation runs off the main thread.

## Simulation State

```typescript
type SimulationState = 'NotRun' | 'Paused' | 'Running' | 'Complete' | 'Error';
```

| WorkerStatus             | SimulationState |
| ------------------------ | --------------- |
| `idle`, `initializing`   | `NotRun`        |
| `ready`, `paused`        | `Paused`        |
| `running`                | `Running`       |
| `complete`               | `Complete`      |
| `error`                  | `Error`         |

## Configuration

| Property          | Default     | Description                                |
| ----------------- | ----------- | ------------------------------------------ |
| `parameterValues` | `{}`        | User-defined parameters                    |
| `initialMarking`  | `new Map()` | Initial token placement                    |
| `dt`              | `0.01`      | Time step in seconds                       |
| `maxTime`         | `null`      | Simulation end time (immutable after init) |

## Lifecycle

```text
                    ┌─────────────┐
                    │   NotRun    │◄──── reset()
                    └──────┬──────┘
                           │ initialize()
                           ▼
                    ┌─────────────┐
             ┌─────►│   Paused    │◄─────┐
             │      └──────┬──────┘      │
             │             │ run()       │ pause()
             │             ▼             │
             │      ┌─────────────┐      │
             │      │   Running   │──────┘
             │      └──────┬──────┘
             │             │
             │   deadlock/maxTime/error
             │             │
             │             ▼
             │      ┌─────────────┐
             └──────│  Complete   │
                    │  or Error   │
                    └─────────────┘
```

## Key Actions

- `initialize()`: Returns Promise, resolves when worker is ready
- `run()` / `pause()`: Control simulation generation
- `getFrame(index)`: Access computed frames
- `ack(frameNumber)`: Backpressure control (called by PlaybackProvider)
- `setBackpressure()`: Configure worker backpressure parameters

## Usage

```tsx
<SimulationProvider>
  <PlaybackProvider>
    <App />
  </PlaybackProvider>
</SimulationProvider>

// In component:
const simulation = use(SimulationContext);
await simulation.initialize({ seed: 42, dt: 0.01, maxFramesAhead: 100, batchSize: 50 });
simulation.run();
```
