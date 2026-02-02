# Simulation Module

React context and provider for SDCPN simulation management.

## SimulationProvider

Wraps `useSimulationWorker` and exposes simulation through React Context.

### Simulation State

```typescript
type SimulationState = 'NotRun' | 'Paused' | 'Running' | 'Complete' | 'Error';
```

State mapping from worker:

| WorkerStatus             | SimulationState |
| ------------------------ | --------------- |
| `idle`, `initializing`   | `NotRun`        |
| `ready`, `paused`        | `Paused`        |
| `running`                | `Running`       |
| `complete`               | `Complete`      |
| `error`                  | `Error`         |

### Configuration State

| Property                | Type                       | Default       | Description                                |
| ----------------------- | -------------------------- | ------------- | ------------------------------------------ |
| `parameterValues`       | `Record<string, string>`   | `{}`          | User-defined parameters                    |
| `initialMarking`        | `Map<placeId, Marking>`    | `new Map()`   | Initial token placement                    |
| `dt`                    | `number`                   | `0.01`        | Time step                                  |
| `maxTime`               | `number \| null`           | `null`        | Simulation end time (immutable after init) |
| `computeBufferDuration` | `number`                   | `1`           | Buffer ahead time                          |

> **Note:** `maxTime` can be configured via `setMaxTime()` before calling `initialize()`,
> but once the simulation is initialized, `maxTime` becomes immutable and is stored
> in the `SimulationInstance`. The simulator checks this value in `computeNextFrame()`.

### Context Value

```typescript
type SimulationContextValue = {
  // State
  state: SimulationState;
  error: string | null;
  errorItemId: string | null;
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  dt: number;
  maxTime: number | null;
  computeBufferDuration: number;
  totalFrames: number;

  // Frame Access
  getFrame: (index: number) => Promise<SimulationFrame | null>;
  getAllFrames: () => Promise<SimulationFrame[]>;

  // Configuration Actions
  setInitialMarking: (placeId: string, marking: Marking) => void;
  setParameterValue: (parameterId: string, value: string) => void;
  setDt: (dt: number) => void;
  setMaxTime: (maxTime: number | null) => void;
  setComputeBufferDuration: (duration: number) => void;
  initializeParameterValuesFromDefaults: () => void;

  // Lifecycle Actions
  initialize: (config: { seed: number; dt: number }) => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
};
```

### Lifecycle

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

### Usage

```tsx
<SimulationProvider>
  <App />
</SimulationProvider>

// In component:
const simulation = use(SimulationContext);
simulation.initialize({ seed: 42, dt: 0.01 });
simulation.run();
```
