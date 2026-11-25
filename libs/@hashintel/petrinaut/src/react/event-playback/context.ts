import { createContext } from "react";

import { constantStore } from "../shared/use-store";

import type {
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
  ReadableStore,
  TracePlayerSnapshot,
} from "@hashintel/petrinaut-core";

/**
 * Playback over the viewed execution. The viewed position is a time, or a
 * step of an untimed net. Any position the trace covers can be viewed in a
 * continuous execution. A discrete one changes only at its events, so its
 * view rests on one: it is between two events only while it plays.
 *
 * Nothing in this value changes at frame rate. The viewed position lives in
 * `playbackStore`; a component that shows it reads it through
 * `useEventPlaybackFrame`, and a canvas or a DOM write subscribes to the
 * store directly, so a frame of playback renders only what shows the time.
 */
export type EventPlaybackContextValue = {
  /** Position of the first event the trace holds; the view never goes before it. */
  startTime: number;
  /** Position the trace covers; the view never passes it. */
  coveredTime: number;
  /** Events recorded so far, the initial state included. */
  eventCount: number;
  /** The viewed position, play state, speed and mode, updated every frame while playing. */
  playbackStore: ReadableStore<TracePlayerSnapshot>;

  playbackState: PlaybackState;
  playbackSpeed: PlaybackSpeed;
  playMode: PlayMode;
  /** True when there is a trace to view. */
  isViewOnlyAvailable: boolean;
  /** True while a simulation can still compute. Never for an execution the host reports. */
  isComputeAvailable: boolean;

  /**
   * Views `time`, clamped to what the trace covers. A discrete execution is
   * viewed at its last event at or before it.
   */
  setTime: (time: number) => void;
  /**
   * Views the previous or next firing, or the initial state. The reference
   * events the trace keeps between firings are stepped over.
   */
  stepToEvent: (direction: -1 | 1) => void;
  /** Starts playback. With no run yet, a simulation is initialized and started first. */
  play: () => Promise<void>;
  /** Pauses. A discrete execution then rests on the event it last passed. */
  pause: () => void;
  /** Pauses and returns to the start of the trace. */
  stop: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setPlayMode: (mode: PlayMode) => void;
};

const STOPPED_SNAPSHOT: TracePlayerSnapshot = {
  playState: "Stopped",
  time: 0,
  speed: 1,
  mode: "computeBuffer",
  following: false,
};

const DEFAULT_CONTEXT_VALUE: EventPlaybackContextValue = {
  startTime: 0,
  coveredTime: 0,
  eventCount: 0,
  playbackStore: constantStore(STOPPED_SNAPSHOT),
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
