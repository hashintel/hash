import { createContext } from "react";

import type { SimulationFrameState } from "../simulation/context";

/**
 * Current state of the playback lifecycle.
 */
export type PlaybackState = "Stopped" | "Playing" | "Paused";

/**
 * Available playback speed multipliers.
 * Infinity represents "Max" speed (as fast as possible).
 */
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/**
 * All available playback speeds for UI iteration.
 */
export const PLAYBACK_SPEEDS = [1, 2, 5, 10, 30, 60, 120, Infinity] as const;

/**
 * Format a playback speed for display.
 */
export function formatPlaybackSpeed(speed: PlaybackSpeed): string {
  return speed === Infinity ? "Max" : `${speed}x`;
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
   * The currently viewed simulation frame state.
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
};

const DEFAULT_CONTEXT_VALUE: PlaybackContextValue = {
  currentViewedFrame: null,
  playbackState: "Stopped",
  currentFrameIndex: 0,
  totalFrames: 0,
  playbackSpeed: 1,
  setCurrentViewedFrame: () => {},
  play: () => {},
  pause: () => {},
  stop: () => {},
  setPlaybackSpeed: () => {},
};

export const PlaybackContext = createContext<PlaybackContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
