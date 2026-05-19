# Simulation Worker

Worker runtime for off-main-thread SDCPN simulation computation.

## Overview

The worker computes simulation frames in batches, controlled by backpressure
from its host transport. This keeps the caller responsive while allowing fast
computation.

## Messages

**Host → Worker:**

| Type              | Payload                                                                                      | Description                         |
| ----------------- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| `init`            | `{ sdcpn, initialMarking, parameterValues, seed, dt, maxTime, maxFramesAhead?, batchSize? }` | Initialize simulation               |
| `start`           | —                                                                                            | Begin/resume computing frames       |
| `pause`           | —                                                                                            | Pause computation (state retained)  |
| `stop`            | —                                                                                            | Stop and discard simulation         |
| `setBackpressure` | `{ maxFramesAhead?, batchSize? }`                                                            | Reconfigure backpressure at runtime |
| `ack`             | `{ frameNumber }`                                                                            | Acknowledge frame receipt           |

**Worker → Host:**

| Type       | Payload                                            | Description             |
| ---------- | -------------------------------------------------- | ----------------------- |
| `ready`    | `{ initialFrameCount }`                            | Initialization complete |
| `frame`    | `{ frame: SimulationFramePayload }`                | Single frame payload    |
| `frames`   | `{ frames: SimulationFramePayload[] }`             | Batch of frame payloads |
| `complete` | `{ reason: 'deadlock' \| 'maxTime', frameNumber }` | Simulation ended        |
| `paused`   | `{ frameNumber }`                                  | Worker has paused       |
| `error`    | `{ message, itemId: string \| null }`              | Error occurred          |

`SimulationFramePayload.frame` is a binary `ArrayBuffer`. Host code should not
read it directly; `runtime/frame-store.ts` specializes a `SimulationFrameReader`
from the SDCPN snapshot and exposes that reader through the public simulation
API.

## Backpressure

The worker blocks computation until it receives an `ack` message, then computes
up to `maxFramesAhead` frames beyond the acknowledged frame before waiting
again.

**Key behavior:**

- Worker starts with `lastAckedFrame = -1` and blocks until the first ack.
- Hosts should ack frames as they consume or persist them.
- If no ack is sent, no new frames are computed after initialization.

**Common backpressure profiles:**

| Play Mode        | maxFramesAhead | batchSize | Ack Behavior                     |
| ---------------- | -------------- | --------- | -------------------------------- |
| `viewOnly`       | 0              | 0         | Never acks (no computation)      |
| `computeBuffer`  | 40             | 10        | Acks when near end of frames     |
| `computeMax`     | 10000          | 500       | Acks on every new frame arrival  |

---

## Consuming this worker from host code

Host code should use the standalone `createSimulation` factory from `/core`:

```ts
import { createSimulation } from "@hashintel/petrinaut-core";

const sim = await createSimulation({
  sdcpn,
  initialMarking: {
    queue: 10,
    customer: [{ waitTime: 0 }],
  },
  parameterValues,
  seed,
  dt,
  maxTime,
  createWorker: () => new Worker(/* … */),
});

sim.run();
```

The default browser worker factory lives in `./create-simulation-worker.ts`.
It returns a `Promise<Worker>` that imports the worker module via Vite's
`?worker&inline` syntax.
