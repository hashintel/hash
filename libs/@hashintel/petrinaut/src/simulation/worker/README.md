# Simulation Worker

This folder contains the WebWorker implementation for running SDCPN simulations off the main thread.

## Overview

The simulation worker provides:

- **Non-blocking computation**: Simulation runs in a separate thread, keeping UI responsive
- **Streaming frames**: Frames are sent to main thread as they're computed
- **Hot-reloadable parameters**: Parameter values can be updated without rebuilding
- **Backpressure**: Prevents unbounded memory growth when computing faster than consuming

## Files

| File | Description |
|------|-------------|
| `messages.ts` | TypeScript types for worker ↔ main thread communication |
| `simulation.worker.ts` | WebWorker entry point and compute loop |
| `use-simulation-worker.ts` | React hook for worker communication |

## Usage

### Basic Usage

```tsx
import { useSimulationWorker } from "./worker/use-simulation-worker";

function MyComponent() {
  const { state, actions } = useSimulationWorker();

  const handleStart = () => {
    actions.initialize({
      sdcpn,
      initialMarking,
      parameterValues,
      seed: 42,
      dt: 0.01,
    });
    actions.start();
  };

  return (
    <div>
      <p>Status: {state.status}</p>
      <p>Frames computed: {state.frames.length}</p>
      <button onClick={handleStart}>Start</button>
      <button onClick={actions.pause}>Pause</button>
    </div>
  );
}
```

### With SimulationProvider

The `SimulationProvider` integrates the worker with React context:

```tsx
// In SimulationProvider
const { state: workerState, actions: workerActions } = useSimulationWorker();

// Expose frames through context
const contextValue = {
  frames: workerState.frames,
  status: workerState.status,
  // ... map worker state to context interface
};
```

## Message Protocol

### Main Thread → Worker

#### `init`

Initialize simulation with SDCPN and configuration.

```typescript
{
  type: "init",
  sdcpn: SDCPN,
  initialMarking: Array<[string, { values: Float64Array; count: number }]>,
  parameterValues: Record<string, string>,
  seed: number,
  dt: number,
}
```

**Note**: `initialMarking` is serialized from `Map` to array of entries because `Map` is not structured-cloneable.

#### `start`

Begin or resume computing frames.

```typescript
{ type: "start" }
```

#### `pause`

Pause computation. State is retained and can be resumed.

```typescript
{ type: "pause" }
```

#### `stop`

Stop and discard the simulation entirely.

```typescript
{ type: "stop" }
```

#### `updateParameters`

Hot-reload parameter values. Takes effect on next computed frame.

```typescript
{
  type: "updateParameters",
  parameterValues: Record<string, number | boolean>,
}
```

#### `setMaxTime`

Update the maximum simulation time stopping condition.

```typescript
{
  type: "setMaxTime",
  maxTime: number | null,
}
```

#### `ack`

Acknowledge receipt of frames (backpressure mechanism).

```typescript
{
  type: "ack",
  frameNumber: number,
}
```

### Worker → Main Thread

#### `ready`

Worker has initialized successfully.

```typescript
{
  type: "ready",
  initialFrameCount: number,
}
```

#### `frame`

Single frame computed.

```typescript
{
  type: "frame",
  frame: SimulationFrame,
}
```

#### `frames`

Batch of frames (optimization for high throughput).

```typescript
{
  type: "frames",
  frames: SimulationFrame[],
}
```

#### `complete`

Simulation has ended.

```typescript
{
  type: "complete",
  reason: "deadlock" | "maxTime",
  frameNumber: number,
}
```

#### `paused`

Worker has paused.

```typescript
{
  type: "paused",
  frameNumber: number,
}
```

#### `error`

An error occurred.

```typescript
{
  type: "error",
  message: string,
  itemId: string | null,
}
```

## Backpressure

The worker implements backpressure to prevent unbounded memory growth:

1. Worker tracks `lastAckedFrame` (frames acknowledged by main thread)
2. Worker pauses if `currentFrame - lastAckedFrame > MAX_FRAMES_AHEAD`
3. Main thread periodically sends `ack` messages with current frame count
4. Worker resumes when buffer drains

```
Worker                          Main Thread
   │                                 │
   │── frame 1 ────────────────────►│
   │── frame 2 ────────────────────►│
   │── ...                          │
   │── frame 1000 ─────────────────►│
   │                                 │
   │   (pauses, MAX_FRAMES_AHEAD)   │
   │                                 │
   │◄───────────── ack(500) ────────│
   │                                 │
   │── frame 1001 ─────────────────►│
   │── ...                          │
```

Configuration in `simulation.worker.ts`:

```typescript
const MAX_FRAMES_AHEAD = 1000;  // Pause threshold
const BATCH_SIZE = 10;          // Frames per compute batch
```

## Hot Parameter Reloading

Parameters can be changed without rebuilding the simulation:

```typescript
// Main thread
actions.updateParameters({ birthRate: 0.8, deathRate: 0.2 });

// Worker (internal)
simulation.parameterValues = newValues;
// Next computeNextFrame() uses new values
```

**Limitations**:

- Only numeric/boolean parameter values can be hot-reloaded
- Structural changes (new places, modified code) require full rebuild
- Changes take effect on next frame, not retroactively

## Error Handling

Errors are caught and reported to main thread:

```typescript
// Worker catches errors during computation
try {
  computeNextFrame(simulation);
} catch (error) {
  postMessage({
    type: "error",
    message: error.message,
    itemId: error instanceof SDCPNItemError ? error.itemId : null,
  });
}
```

The `itemId` helps the UI highlight which SDCPN element caused the error.

## Testing

The worker can be tested in isolation by mocking `postMessage`:

```typescript
// test setup
const messages: ToMainMessage[] = [];
global.postMessage = (msg) => messages.push(msg);

// trigger message handler
self.onmessage({ data: { type: "init", ... } });

// assert
expect(messages).toContainEqual({ type: "ready", ... });
```

## Performance Considerations

1. **Batch size**: Higher `BATCH_SIZE` improves throughput but reduces responsiveness
2. **Ack frequency**: Lower `ACK_INTERVAL_MS` provides tighter backpressure but more overhead
3. **Frame size**: Larger `Float64Array` buffers take longer to transfer
4. **Transfer vs Clone**: Currently uses structured clone; could optimize with `Transferable` for large buffers

## Future Improvements

- [ ] Use `Transferable` for `Float64Array` buffers to avoid copying
- [ ] Implement frame compression for large simulations
- [ ] Add performance metrics reporting
- [ ] Support multiple concurrent simulations
