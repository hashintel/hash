# Simulation Worker

WebWorker for off-main-thread SDCPN simulation computation.

## Worker Internal State

| State            | Type                           | Description                                            |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| `simulation`     | `SimulationInstance \| null`   | The compiled simulation instance (includes maxTime)    |
| `isRunning`      | `boolean`                      | Whether the compute loop is active                     |
| `lastAckedFrame` | `number`                       | Last frame acknowledged by main thread (backpressure)  |
| `maxFramesAhead` | `number`                       | Configurable backpressure threshold                    |
| `batchSize`      | `number`                       | Frames computed per batch                              |

## Messages: Main Thread → Worker

| Type              | Payload                                                                          | Description                          |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| `init`            | `{ sdcpn, initialMarking, parameterValues, seed, dt, maxTime, maxFramesAhead?, batchSize? }` | Initialize simulation   |
| `start`           | —                                                                                | Begin/resume computing frames        |
| `pause`           | —                                                                                | Pause computation (state retained)   |
| `stop`            | —                                                                                | Stop and discard simulation          |
| `setBackpressure` | `{ maxFramesAhead?, batchSize? }`                                                | Reconfigure backpressure at runtime  |
| `ack`             | `{ frameNumber }`                                                                | Acknowledge frame receipt            |

## Messages: Worker → Main Thread

| Type       | Payload                                                   | Description                          |
| ---------- | --------------------------------------------------------- | ------------------------------------ |
| `ready`    | `{ initialFrameCount }`                                   | Initialization complete              |
| `frame`    | `{ frame: SimulationFrame }`                              | Single frame computed                |
| `frames`   | `{ frames: SimulationFrame[] }`                           | Batch of frames                      |
| `complete` | `{ reason: 'deadlock' \| 'maxTime', frameNumber }`        | Simulation ended                     |
| `paused`   | `{ frameNumber }`                                         | Worker has paused                    |
| `error`    | `{ message, itemId: string \| null }`                     | Error occurred                       |

## Backpressure

Worker pauses when `currentFrame - lastAckedFrame > maxFramesAhead`.
Main thread sends periodic `ack` messages to allow worker to continue.

Backpressure parameters can be configured:

- At initialization via `init` message (`maxFramesAhead`, `batchSize`)
- At runtime via `setBackpressure` message

## Configuration

```typescript
// Default values (can be overridden)
const DEFAULT_MAX_FRAMES_AHEAD = 100000; // Pause threshold
const DEFAULT_BATCH_SIZE = 1000;         // Frames per compute batch
```

## maxTime Handling

The `maxTime` simulation stopping condition is:

- Set at initialization via the `init` message
- Stored in `SimulationInstance` (immutable once set)
- Checked by `computeNextFrame` in the simulator, not the worker
- Cannot be changed after initialization

---

# useSimulationWorker Hook

React hook wrapping the WebWorker communication.

## Hook State

```typescript
type WorkerStatus = 'idle' | 'initializing' | 'ready' | 'running' | 'paused' | 'complete' | 'error';

const { state, actions } = useSimulationWorker();

// state
state.status: WorkerStatus
state.frames: SimulationFrame[]
state.error: string | null
state.errorItemId: string | null
```

## Hook Actions

| Action            | Signature                                              | Description                         |
| ----------------- | ------------------------------------------------------ | ----------------------------------- |
| `initialize`      | `(config: InitializeParams) => void`                   | Send init message, clear frames     |
| `start`           | `() => void`                                           | Send start message                  |
| `pause`           | `() => void`                                           | Send pause message                  |
| `stop`            | `() => void`                                           | Send stop message, reset state      |
| `reset`           | `() => void`                                           | Alias for stop                      |
| `setBackpressure` | `(params: { maxFramesAhead?, batchSize? }) => void`    | Reconfigure backpressure at runtime |

### InitializeParams

```typescript
type InitializeParams = {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number | null;       // Immutable once set
  maxFramesAhead?: number;      // Optional backpressure config
  batchSize?: number;           // Optional backpressure config
};
```

## Status Transitions

```text
idle → initializing → ready → running ⇄ paused
                         ↓         ↓
                      complete   error
```
