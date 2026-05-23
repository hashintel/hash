import type { ReadableStore } from "../handle";

export type PlaybackState = "Stopped" | "Playing" | "Paused";

/**
 * Play mode determines how simulation computation is handled during playback.
 * - `viewOnly`: Only plays existing frames, no further computation.
 * - `computeBuffer`: Computes minimally, only when ahead-buffer is shallow.
 * - `computeMax`: Computes as fast as possible while playing.
 */
export type PlayMode = "viewOnly" | "computeBuffer" | "computeMax";

export type ComputePlayMode = Exclude<PlayMode, "viewOnly">;

export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 30, 60, 120, Number.POSITIVE_INFINITY] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export function formatPlaybackSpeed(speed: PlaybackSpeed): string {
  return speed === Number.POSITIVE_INFINITY ? "Max" : `${speed}x`;
}

/**
 * Backpressure configuration for a compute play mode. Used to tell the
 * simulation worker how aggressively to compute new frames.
 *
 * `viewOnly` intentionally has no backpressure shape: it is a frame viewing
 * mode, not a worker computation mode.
 */
export type PlayModeBackpressure = {
  maxFramesAhead: number;
  batchSize: number;
};

export function getPlayModeBackpressure(mode: ComputePlayMode): PlayModeBackpressure {
  return mode === "computeBuffer"
    ? { maxFramesAhead: 40, batchSize: 10 }
    : { maxFramesAhead: 10000, batchSize: 500 };
}

export type PlaybackSnapshot = {
  playState: PlaybackState;
  frameIndex: number;
  speed: PlaybackSpeed;
  mode: PlayMode;
};

const DEFAULT_SNAPSHOT: PlaybackSnapshot = {
  playState: "Stopped",
  frameIndex: 0,
  speed: 1,
  mode: "computeMax",
};

/**
 * Result of a {@link Playback.tick} call. The caller can react to these
 * signals (e.g. pause the underlying simulation when `reachedEnd` is true and
 * mode is `viewOnly`).
 */
export type TickResult = {
  /** New frame index after the tick. */
  frameIndex: number;
  /** True if the tick caused frameIndex to change. */
  advanced: boolean;
  /** True if the tick reached the last available frame. */
  reachedEnd: boolean;
};

export type TickInput = {
  /** Current high-resolution timestamp (ms), e.g. from `performance.now()`. */
  currentTime: number;
  /** Simulation time-step, seconds. */
  dt: number;
  /** Total computed frames available right now. */
  totalFrames: number;
  /** True if the simulation has finished computing (Complete or Error). */
  simulationDone: boolean;
};

export interface Playback {
  readonly state: ReadableStore<PlaybackSnapshot>;

  play(this: void): void;
  pause(this: void): void;
  stop(this: void): void;

  setFrameIndex(this: void, index: number, totalFrames: number): void;
  setSpeed(this: void, speed: PlaybackSpeed): void;
  setMode(this: void, mode: PlayMode): void;

  /**
   * Advance one tick of the playback timing loop. Caller is responsible for
   * driving this — e.g. via `requestAnimationFrame` in the browser, or by
   * calling it manually for headless replay/test scenarios.
   *
   * Updates the snapshot's `frameIndex` based on elapsed time since the
   * previous tick. Returns details about what happened so the caller can
   * react (e.g. auto-pause when reaching the end in viewOnly mode).
   */
  tick(this: void, input: TickInput): TickResult;

  /**
   * Reset internal timing state (last tick time, accumulated time). Call
   * after pausing-then-resuming to avoid a "jump" on the next tick.
   */
  resetTiming(this: void): void;

  dispose(this: void): void;
}

function createReadableStore<T>(initial: T): ReadableStore<T> & {
  set(next: T): void;
  update(updater: (prev: T) => T): void;
} {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
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

/**
 * Create a {@link Playback} handle. Pure timing model: tracks playback state,
 * frame index, speed, and mode, and advances frame index on `tick()`. Does
 * **not** know about simulations or `requestAnimationFrame` — those concerns
 * live in the consumer (e.g. the React {@link import("../../react/playback").PlaybackProvider}).
 */
export function createPlayback(initial?: Partial<PlaybackSnapshot>): Playback {
  const store = createReadableStore<PlaybackSnapshot>({
    ...DEFAULT_SNAPSHOT,
    ...initial,
  });

  let lastTickTime: number | null = null;
  let accumulatedTime = 0;
  let disposed = false;

  return {
    state: store,

    play() {
      if (disposed) {
        return;
      }
      lastTickTime = null;
      accumulatedTime = 0;
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
      accumulatedTime = 0;
      store.update((prev) => ({
        ...prev,
        playState: "Stopped",
        frameIndex: 0,
      }));
    },

    setFrameIndex(index, totalFrames) {
      if (disposed) {
        return;
      }
      if (totalFrames === 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(index, totalFrames - 1));
      store.update((prev) => ({ ...prev, frameIndex: clamped }));
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
      accumulatedTime = 0;
    },

    tick({ currentTime, dt, totalFrames, simulationDone }) {
      const snapshot = store.get();

      if (disposed || snapshot.playState !== "Playing" || totalFrames === 0) {
        lastTickTime = currentTime;
        return {
          frameIndex: snapshot.frameIndex,
          advanced: false,
          reachedEnd: snapshot.frameIndex >= totalFrames - 1,
        };
      }

      // Max speed: jump to latest available frame.
      if (snapshot.speed === Number.POSITIVE_INFINITY) {
        const newIndex = totalFrames - 1;
        const advanced = newIndex !== snapshot.frameIndex;
        if (advanced) {
          store.update((prev) => ({ ...prev, frameIndex: newIndex }));
        }
        const reachedEnd = newIndex >= totalFrames - 1;
        if (reachedEnd && (simulationDone || snapshot.mode === "viewOnly")) {
          store.update((prev) => ({ ...prev, playState: "Paused" }));
        }
        lastTickTime = currentTime;
        return { frameIndex: newIndex, advanced, reachedEnd };
      }

      // Real-time speed: advance based on elapsed wall-clock time × speed.
      const previousTime = lastTickTime ?? currentTime;
      const deltaMs = currentTime - previousTime;
      lastTickTime = currentTime;

      accumulatedTime += deltaMs * snapshot.speed;
      const frameDurationMs = dt * 1000;
      const framesToAdvance = Math.floor(accumulatedTime / frameDurationMs);

      if (framesToAdvance <= 0) {
        return {
          frameIndex: snapshot.frameIndex,
          advanced: false,
          reachedEnd: snapshot.frameIndex >= totalFrames - 1,
        };
      }

      accumulatedTime -= framesToAdvance * frameDurationMs;
      const desired = snapshot.frameIndex + framesToAdvance;
      const newIndex = Math.min(desired, totalFrames - 1);
      const reachedEnd = newIndex >= totalFrames - 1;

      if (reachedEnd && (simulationDone || snapshot.mode === "viewOnly")) {
        store.update((prev) => ({
          ...prev,
          frameIndex: newIndex,
          playState: "Paused",
        }));
      } else {
        store.update((prev) => ({ ...prev, frameIndex: newIndex }));
      }

      return { frameIndex: newIndex, advanced: true, reachedEnd };
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      lastTickTime = null;
      accumulatedTime = 0;
    },
  };
}
