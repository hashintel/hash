import { createContext } from "react";

import {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
} from "../../core/playback";
import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "../simulation/context";

// Re-export the locked enums/helpers so existing UI consumers don't need to
// know they live in /core now.
export {
  formatPlaybackSpeed,
  PLAYBACK_SPEEDS,
  type PlaybackSpeed,
  type PlaybackState,
  type PlayMode,
};

/**
 * The combined playback context containing both state and actions.
 *
 * PlaybackContext is responsible for viewing simulation frames at real-time speed.
 * It reads simulation data from SimulationContext and handles frame advancement
 * using requestAnimationFrame, optimized for 60Hz maximum.
 */
export type PlaybackContextValue = {
  // State values
  /**
   * Reader for the currently viewed frame.
   * Null when no simulation is running or no frames exist.
   */
  currentFrameReader: SimulationFrameReader | null;

  /**
   * The currently viewed simulation frame state (simplified view).
   * Provides easy access to token counts and transition states.
   * Null when no simulation is running or no frames exist.
   */
  currentViewedFrame: SimulationFrameState | null;

  /**
   * Current playback state.
   */
  playbackState: PlaybackState;

  /**
   * The index of the currently viewed frame.
   */
  currentFrameIndex: number;

  /**
   * Total number of available frames.
   */
  totalFrames: number;

  /**
   * Current playback speed multiplier.
   * 1x means real-time, 2x means twice as fast, etc.
   */
  playbackSpeed: PlaybackSpeed;

  /**
   * Current play mode determining computation behavior.
   */
  playMode: PlayMode;

  /**
   * Whether viewOnly mode is available.
   * True when there are computed frames to view.
   */
  isViewOnlyAvailable: boolean;

  /**
   * Whether compute modes are available.
   * True when simulation is not Complete or Error (can still compute more frames).
   */
  isComputeAvailable: boolean;

  // Actions
  /**
   * Set the currently viewed frame by index.
   * Used for manual scrubbing through the timeline.
   */
  setCurrentViewedFrame: (frameIndex: number) => void;

  /**
   * Start playback from the current frame.
   * Advances frames at real-time speed based on dt from SimulationContext.
   * If simulation hasn't started yet, initializes and starts it first.
   * Returns a Promise that resolves when playback has started.
   */
  play: () => Promise<void>;

  /**
   * Pause playback at the current frame.
   */
  pause: () => void;

  /**
   * Stop playback and reset to frame 0.
   */
  stop: () => void;

  /**
   * Set the playback speed multiplier.
   */
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;

  /**
   * Set the play mode for computation behavior.
   */
  setPlayMode: (mode: PlayMode) => void;
};

const DEFAULT_CONTEXT_VALUE: PlaybackContextValue = {
  currentFrameReader: null,
  currentViewedFrame: null,
  playbackState: "Stopped",
  currentFrameIndex: 0,
  totalFrames: 0,
  playbackSpeed: 1,
  playMode: "computeMax",
  isViewOnlyAvailable: false,
  isComputeAvailable: true,
  setCurrentViewedFrame: () => {},
  play: () => Promise.resolve(),
  pause: () => {},
  stop: () => {},
  setPlaybackSpeed: () => {},
  setPlayMode: () => {},
};

export const PlaybackContext = createContext<PlaybackContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
