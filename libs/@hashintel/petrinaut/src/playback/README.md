# Playback Module

React context for viewing simulation frames at controlled speeds.

## PlaybackContext

Reads frames from SimulationContext and handles frame advancement using requestAnimationFrame (optimized for 60Hz).

### Playback State

```typescript
type PlaybackState = 'Stopped' | 'Playing' | 'Paused';
```

### Play Mode

Determines how simulation computation is handled during playback.

| Mode            | Description                           | Available When                    |
| --------------- | ------------------------------------- | --------------------------------- |
| `viewOnly`      | Only plays existing frames            | Simulation is Complete or Error   |
| `computeBuffer` | Computes when < 100 frames ahead      | Simulation can compute more       |
| `computeMax`    | Computes as fast as possible          | Simulation can compute more       |

### Playback Speed

```typescript
const PLAYBACK_SPEEDS = [1, 2, 5, 10, 30, 60, 120, Infinity] as const;
// Infinity = "Max" speed (as fast as possible)
```

### Context Value

```typescript
type PlaybackContextValue = {
  // State
  currentFrame: SimulationFrame | null;
  currentViewedFrame: SimulationFrameState | null;
  playbackState: PlaybackState;
  currentFrameIndex: number;
  totalFrames: number;
  playbackSpeed: PlaybackSpeed;
  playMode: PlayMode;
  isViewOnlyAvailable: boolean;
  isComputeAvailable: boolean;

  // Actions
  setCurrentViewedFrame: (frameIndex: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setPlayMode: (mode: PlayMode) => void;
};
```

### Lifecycle

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

### Integration with SimulationContext

PlaybackContext reads from SimulationContext:

- Gets frames via `getFrame()` / `getAllFrames()`
- Uses `dt` for real-time playback timing
- Monitors `totalFrames` to know when new frames are available
- Uses `state` to determine available play modes

### Usage

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
