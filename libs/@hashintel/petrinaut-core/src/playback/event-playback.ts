import type { ReadableStore } from "../store";
import type {
  ComputePlayMode,
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
} from "./playback";

/**
 * Playback over an event trace holds a simulation time rather than a frame
 * index: any time the trace covers can be viewed, not only the recorded
 * events.
 */
export type EventPlaybackSnapshot = {
  playState: PlaybackState;
  /** The viewed simulation time, in seconds. */
  time: number;
  speed: PlaybackSpeed;
  mode: PlayMode;
};

export type EventTickInput = {
  /** Current high-resolution timestamp (ms), e.g. from `performance.now()`. */
  currentTime: number;
  /** Simulation time the trace covers; playback never moves past it. */
  coveredTime: number;
  /** True once the run has finished computing (complete or error). */
  simulationDone: boolean;
};

export type EventTickResult = {
  time: number;
  advanced: boolean;
  /** True when the tick reached the covered time. */
  reachedEnd: boolean;
};

export interface EventPlayback {
  readonly state: ReadableStore<EventPlaybackSnapshot>;

  play(this: void): void;
  pause(this: void): void;
  stop(this: void): void;

  /** Views `time`, clamped to what the trace covers. */
  setTime(this: void, time: number, coveredTime: number): void;
  setSpeed(this: void, speed: PlaybackSpeed): void;
  setMode(this: void, mode: PlayMode): void;

  /**
   * Advances the viewed time by the wall-clock time since the previous tick,
   * scaled by the speed; the caller drives it from `requestAnimationFrame`.
   */
  tick(this: void, input: EventTickInput): EventTickResult;

  /** Forgets the previous tick, so resuming does not jump. */
  resetTiming(this: void): void;

  dispose(this: void): void;
}

/**
 * How far ahead of the viewed time, in simulated seconds, each compute mode
 * asks the worker to run. The buffer mode keeps a short lead so pausing
 * wastes little; the max mode never holds the worker back.
 */
export const EVENT_PLAY_MODE_LEAD: Record<ComputePlayMode, number> = {
  computeBuffer: 2,
  computeMax: Number.POSITIVE_INFINITY,
};

const DEFAULT_SNAPSHOT: EventPlaybackSnapshot = {
  playState: "Stopped",
  time: 0,
  speed: 1,
  mode: "computeBuffer",
};

function createSnapshotStore(
  initial: EventPlaybackSnapshot,
): ReadableStore<EventPlaybackSnapshot> & {
  update(updater: (prev: EventPlaybackSnapshot) => EventPlaybackSnapshot): void;
} {
  let current = initial;
  const listeners = new Set<(value: EventPlaybackSnapshot) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(updater) {
      const next = updater(current);
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

export function createEventPlayback(
  initial?: Partial<EventPlaybackSnapshot>,
): EventPlayback {
  const store = createSnapshotStore({ ...DEFAULT_SNAPSHOT, ...initial });
  let lastTickTime: number | null = null;
  let disposed = false;

  return {
    state: store,

    play() {
      if (disposed) {
        return;
      }
      lastTickTime = null;
      store.update((prev) => ({ ...prev, playState: "Playing" }));
    },

    pause() {
      if (disposed) {
        return;
      }
      store.update((prev) => ({ ...prev, playState: "Paused" }));
    },

    stop() {
      if (disposed) {
        return;
      }
      lastTickTime = null;
      store.update((prev) => ({ ...prev, playState: "Stopped", time: 0 }));
    },

    setTime(time, coveredTime) {
      if (disposed) {
        return;
      }
      const clamped = Math.max(0, Math.min(time, coveredTime));
      store.update((prev) => ({ ...prev, time: clamped }));
    },

    setSpeed(speed) {
      if (disposed) {
        return;
      }
      store.update((prev) => ({ ...prev, speed }));
    },

    setMode(mode) {
      if (disposed) {
        return;
      }
      store.update((prev) => ({ ...prev, mode }));
    },

    resetTiming() {
      lastTickTime = null;
    },

    tick({ currentTime, coveredTime, simulationDone }) {
      const snapshot = store.get();
      const previousTime = lastTickTime ?? currentTime;
      lastTickTime = currentTime;

      if (disposed || snapshot.playState !== "Playing") {
        return {
          time: snapshot.time,
          advanced: false,
          reachedEnd: snapshot.time >= coveredTime,
        };
      }

      const elapsedSeconds =
        snapshot.speed === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : ((currentTime - previousTime) / 1000) * snapshot.speed;
      const time = Math.min(snapshot.time + elapsedSeconds, coveredTime);
      const reachedEnd = time >= coveredTime;
      // At the end of what is computed, playback holds: it resumes on its own
      // when the trace grows, and pauses for good once the run is over.
      const playState =
        reachedEnd && (simulationDone || snapshot.mode === "viewOnly")
          ? "Paused"
          : snapshot.playState;

      store.update((prev) =>
        prev.time === time && prev.playState === playState
          ? prev
          : { ...prev, time, playState },
      );

      return { time, advanced: time !== snapshot.time, reachedEnd };
    },

    dispose() {
      disposed = true;
      lastTickTime = null;
    },
  };
}
