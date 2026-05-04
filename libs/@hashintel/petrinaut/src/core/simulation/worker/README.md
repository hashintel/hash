# Simulation Worker

WebWorker for off-main-thread SDCPN simulation computation.

## Overview

The worker computes simulation frames in batches, controlled by backpressure from the main thread. This keeps the UI responsive while allowing fast computation.

## Messages

**Main Thread → Worker:**

| Type              | Payload                                                                                      | Description                         |
| ----------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| `init`            | `{ sdcpn, initialMarking, parameterValues, seed, dt, maxTime, maxFramesAhead?, batchSize? }` | Initialize simulation               |
| `start`           | —                                                                                            | Begin/resume computing frames       |
| `pause`           | —                                                                                            | Pause computation (state retained)  |
| `stop`            | —                                                                                            | Stop and discard simulation         |
| `setBackpressure` | `{ maxFramesAhead?, batchSize? }`                                                            | Reconfigure backpressure at runtime |
| `ack`             | `{ frameNumber }`                                                                            | Acknowledge frame receipt           |

**Worker → Main Thread:**

| Type       | Payload                                            | Description             |
| ---------- | -------------------------------------------------- | ----------------------- |
| `ready`    | `{ initialFrameCount }`                            | Initialization complete |
| `frames`   | `{ frames: SimulationFrame[] }`                    | Batch of frames         |
| `complete` | `{ reason: 'deadlock' \| 'maxTime', frameNumber }` | Simulation ended        |
| `paused`   | `{ frameNumber }`                                  | Worker has paused       |
| `error`    | `{ message, itemId: string \| null }`              | Error occurred          |

## Backpressure

The worker blocks computation until it receives an `ack` message, then computes up to `maxFramesAhead` frames beyond the acknowledged frame before waiting again.

**Key behavior:**

- Worker starts with `lastAckedFrame = -1` (blocked until first ack)
- PlaybackProvider controls ack calls based on play mode
- If no ack is sent (viewOnly mode), no new frames are computed

**Play mode configuration (set by PlaybackProvider):**

| Play Mode        | maxFramesAhead | batchSize | Ack Behavior                     |
| ---------------- | -------------- | --------- | -------------------------------- |
| `viewOnly`       | 0              | 0         | Never acks (no computation)      |
| `computeBuffer`  | 40             | 10        | Acks when near end of frames     |
| `computeMax`     | 10000          | 500       | Acks on every new frame arrival  |

---

## Consuming this worker from main-thread code

The previous `useSimulationWorker` React hook has been removed. Main-thread code now uses the standalone `createSimulation` factory from `/core` (see [`../../../rfc/0001-core-react-ui-split/05-simulation.md`](../../../rfc/0001-core-react-ui-split/05-simulation.md)):

```ts
import { createSimulation } from "@hashintel/petrinaut";

const sim = await createSimulation({
  sdcpn,
  initialMarking,
  parameterValues,
  seed,
  dt,
  maxTime,
  createWorker: () => new Worker(/* … */),
});

sim.run();
```

The default `createWorker` factory used inside `<SimulationProvider>` lives in `./create-simulation-worker.ts`. It returns a `Promise<Worker>` that imports the worker module via Vite's `?worker&inline` syntax.
