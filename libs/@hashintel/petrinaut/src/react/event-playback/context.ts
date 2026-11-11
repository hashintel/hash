import { createContext } from "react";

import type {
  EventPlaybackSnapshot,
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
  ReadableStore,
} from "@hashintel/petrinaut-core";

/**
 * Playback over a run. The viewed position is a simulation time, and any
 * time the trace covers can be viewed.
 *
 * Nothing in this value changes at frame rate. The viewed time lives in
 * `playbackStore`; a component that shows it reads it through
 * `useEventPlaybackFrame`, and a canvas or a DOM write subscribes to the
 * store directly, so a frame of playback renders only what shows the time.
 */
export type EventPlaybackContextValue = {
  /** Simulation time the trace covers; the viewed time never passes it. */
  coveredTime: number;
  /** Events recorded so far, the initial state included. */
  eventCount: number;
  /** The viewed time, play state, speed and mode, updated every frame while playing. */
  playbackStore: ReadableStore<EventPlaybackSnapshot>;

  playbackState: PlaybackState;
  playbackSpeed: PlaybackSpeed;
  playMode: PlayMode;
  /** True when there is a trace to view. */
  isViewOnlyAvailable: boolean;
  /** True while the run can still compute. */
  isComputeAvailable: boolean;

  /** Views `time`, clamped to what the trace covers. */
  setTime: (time: number) => void;
  /**
   * Views the previous or next firing's time, or the initial state. The
   * reference frames the trace keeps between firings are stepped over.
   */
  stepToEvent: (direction: -1 | 1) => void;
  /** Starts playback, initializing and starting the run when none exists. */
  play: () => Promise<void>;
  pause: () => void;
  /** Pauses and returns to time 0. */
  stop: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setPlayMode: (mode: PlayMode) => void;
};

const STOPPED_SNAPSHOT: EventPlaybackSnapshot = {
  playState: "Stopped",
  time: 0,
  speed: 1,
  mode: "computeBuffer",
};

const DEFAULT_CONTEXT_VALUE: EventPlaybackContextValue = {
  coveredTime: 0,
  eventCount: 0,
  playbackStore: { get: () => STOPPED_SNAPSHOT, subscribe: () => () => {} },
  playbackState: "Stopped",
  playbackSpeed: 1,
  playMode: "computeBuffer",
  isViewOnlyAvailable: false,
  isComputeAvailable: true,
  setTime: () => {},
  stepToEvent: () => {},
  play: () => Promise.resolve(),
  pause: () => {},
  stop: () => {},
  setPlaybackSpeed: () => {},
  setPlayMode: () => {},
};

export const EventPlaybackContext = createContext<EventPlaybackContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
