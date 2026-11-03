import { createContext } from "react";

import type { SimulationFrameReader } from "../simulation/context";
import type {
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
} from "@hashintel/petrinaut-core";

/**
 * Playback over an event-driven run. The counterpart of `PlaybackContext`
 * with time in place of frame indices: the viewed position is a simulation
 * time, and any time the trace covers can be viewed.
 */
export type EventPlaybackContextValue = {
  /** The viewed simulation time, in seconds. */
  time: number;
  /** Simulation time the trace covers; the viewed time never passes it. */
  coveredTime: number;
  /** Events recorded so far, the initial state included. */
  eventCount: number;
  /** Index of the last event at or before the viewed time, or -1 before the first. */
  currentEventIndex: number;
  /** True when a firing or the initial state lies before the viewed time. */
  hasPreviousEvent: boolean;
  /** True when a firing lies after the viewed time. */
  hasNextEvent: boolean;
  /** The state at the viewed time, interpolated between events. */
  currentFrameReader: SimulationFrameReader | null;

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

const DEFAULT_CONTEXT_VALUE: EventPlaybackContextValue = {
  time: 0,
  coveredTime: 0,
  eventCount: 0,
  currentEventIndex: -1,
  hasPreviousEvent: false,
  hasNextEvent: false,
  currentFrameReader: null,
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
