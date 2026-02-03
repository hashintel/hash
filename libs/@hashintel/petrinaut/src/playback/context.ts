import { createContext } from "react";

import type {
  SimulationFrame,
  SimulationFrameState,
} from "../simulation/context";

/**
 * Current state of the playback lifecycle.
 */
export type PlaybackState = "Stopped" | "Playing" | "Paused";

/**
 * Play mode determines how simulation computation is handled during playback.
 * - `viewOnly`: Only plays existing frames, no computation. Available when simulation is Complete or Error.
 * - `computeBuffer`: Computes minimally, only when less than 100 frames are available ahead.
 * - `computeMax`: Computes as fast as possible while playing.
 */
export type PlayMode = (typeof PLAY_MODES)[number];

/**
 * All available play modes for UI iteration.
 */
export const PLAY_MODES = ["viewOnly", "computeBuffer", "computeMax"] as const;

/**
 * Available playback speed multipliers.
 * Infinity represents "Max" speed (as fast as possible).
 */
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/**
 * All available playback speeds for UI iteration.
 */
export const PLAYBACK_SPEEDS = [
  1,
  2,
  5,
  10,
  30,
  60,
  120,
  Number.POSITIVE_INFINITY,
] as const;

/**
 * Format a playback speed for display.
 */
export function formatPlaybackSpeed(speed: PlaybackSpeed): string {
  return speed === Number.POSITIVE_INFINITY ? "Max" : `${speed}x`;
}

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
   * The raw simulation frame data for the currently viewed frame.
   * Contains buffer data for accessing token values directly.
   * Null when no simulation is running or no frames exist.
   */
  currentFrame: SimulationFrame | null;

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
   */
  play: () => void;

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
  currentFrame: null,
  currentViewedFrame: null,
  playbackState: "Stopped",
  currentFrameIndex: 0,
  totalFrames: 0,
  playbackSpeed: 1,
  playMode: "computeMax",
  isViewOnlyAvailable: false,
  isComputeAvailable: true,
  setCurrentViewedFrame: () => {},
  play: () => {},
  pause: () => {},
  stop: () => {},
  setPlaybackSpeed: () => {},
  setPlayMode: () => {},
};

export const PlaybackContext = createContext<PlaybackContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
