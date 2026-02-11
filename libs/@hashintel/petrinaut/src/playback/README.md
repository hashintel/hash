# Playback Module

React context for viewing simulation frames at controlled speeds.

## Overview

PlaybackProvider reads frames from SimulationContext and advances them using `requestAnimationFrame`. It controls both visualization playback and simulation computation via backpressure.

## Play Mode

Determines how simulation computation is handled during playback.

| Mode            | Description                  | maxFramesAhead | batchSize | Ack Behavior                    |
| --------------- | ---------------------------- | -------------- | --------- | ------------------------------- |
| `viewOnly`      | Only plays existing frames   | 0              | 0         | Never acks (no computation)     |
| `computeBuffer` | Computes minimally ahead     | 40             | 10        | Acks when near end of frames    |
| `computeMax`    | Computes as fast as possible | 10000          | 500       | Acks on every new frame arrival |

- `viewOnly`: Available when simulation is Complete or Error
- `computeBuffer`/`computeMax`: Available when simulation can still compute

## Playback Speed

```typescript
const PLAYBACK_SPEEDS = [1, 2, 5, 10, 30, 60, 120, Infinity] as const;
```

- Finite speeds: Frame advancement based on elapsed time × speed multiplier
- `Infinity` ("Max"): Jumps directly to latest available frame each tick

## Lifecycle

```text
                    ┌─────────────┐
         stop() ───►│   Stopped   │◄─── initial
                    └──────┬──────┘
                           │ play()
                           ▼
                    ┌─────────────┐
             ┌─────►│   Playing   │◄─────┐
             │      └──────┬──────┘      │
             │             │ pause()     │ play()
             │             ▼             │
             │      ┌─────────────┐      │
             └──────│   Paused    │──────┘
              stop()└─────────────┘
```

Playback auto-pauses when reaching the end of available frames (if simulation is complete or in viewOnly mode).

## Integration with SimulationContext

**Reading:**

- `getFrame()`: Access frame data for current index
- `dt`: Calculate real-time playback timing
- `totalFrames`: Know when new frames are available
- `state`: Determine available play modes

**Writing:**

- `ack(frameNumber)`: Control worker backpressure based on play mode
- `run()` / `pause()`: Control simulation generation in compute modes
- `setBackpressure()`: Update worker configuration when play mode changes

## Usage

```tsx
<SimulationProvider>
  <PlaybackProvider>
    <App />
  </PlaybackProvider>
</SimulationProvider>

// In component:
const playback = use(PlaybackContext);
playback.play();
playback.setPlaybackSpeed(10);
```
