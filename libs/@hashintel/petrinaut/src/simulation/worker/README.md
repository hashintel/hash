# Simulation Worker

WebWorker for off-main-thread SDCPN simulation computation.

## Worker Internal State

| State            | Type                           | Description                                            |
| ---------------- | ------------------------------ | ------------------------------------------------------ |
| `simulation`     | `SimulationInstance \| null`   | The compiled simulation instance                       |
| `isRunning`      | `boolean`                      | Whether the compute loop is active                     |
| `maxTime`        | `number \| null`               | Simulation time stopping condition                     |
| `lastAckedFrame` | `number`                       | Last frame acknowledged by main thread (backpressure)  |

## Messages: Main Thread → Worker

| Type         | Payload                                                   | Description                          |
| ------------ | --------------------------------------------------------- | ------------------------------------ |
| `init`       | `{ sdcpn, initialMarking, parameterValues, seed, dt }`    | Initialize simulation                |
| `start`      | —                                                         | Begin/resume computing frames        |
| `pause`      | —                                                         | Pause computation (state retained)   |
| `stop`       | —                                                         | Stop and discard simulation          |
| `setMaxTime` | `{ maxTime: number \| null }`                             | Update max time stopping condition   |
| `ack`        | `{ frameNumber }`                                         | Acknowledge frame receipt            |

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

Worker pauses when `currentFrame - lastAckedFrame > MAX_FRAMES_AHEAD` (100,000 frames).
Main thread sends periodic `ack` messages to allow worker to continue.

## Configuration

```typescript
const MAX_FRAMES_AHEAD = 100000; // Pause threshold
const BATCH_SIZE = 1000;         // Frames per compute batch
```

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

| Action       | Signature                                | Description                    |
| ------------ | ---------------------------------------- | ------------------------------ |
| `initialize` | `(config: InitConfig) => void`           | Send init message, clear frames|
| `start`      | `() => void`                             | Send start message             |
| `pause`      | `() => void`                             | Send pause message             |
| `stop`       | `() => void`                             | Send stop message, reset state |
| `reset`      | `() => void`                             | Alias for stop                 |
| `setMaxTime` | `(maxTime: number \| null) => void`      | Update max time                |

## Status Transitions

```text
idle → initializing → ready → running ⇄ paused
                         ↓         ↓
                      complete   error
```
