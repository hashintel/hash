import { use } from "react";

import type {
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
} from "../../core/playback";
import {
  PlaybackContext,
  type PlaybackContextValue,
} from "../playback/context";

export function usePlaybackState(): PlaybackState {
  return use(PlaybackContext).playbackState;
}

export function usePlaybackFrameIndex(): number {
  return use(PlaybackContext).currentFrameIndex;
}

export function usePlaybackSpeed(): PlaybackSpeed {
  return use(PlaybackContext).playbackSpeed;
}

export function usePlaybackMode(): PlayMode {
  return use(PlaybackContext).playMode;
}

/** Currently displayed frame data, or `null` if no simulation is running. */
export function useCurrentFrame(): PlaybackContextValue["currentFrame"] {
  return use(PlaybackContext).currentFrame;
}

/** Simplified, UI-shaped view of the current frame. */
export function useCurrentViewedFrame(): PlaybackContextValue["currentViewedFrame"] {
  return use(PlaybackContext).currentViewedFrame;
}

export type PlaybackActionsBundle = {
  play: PlaybackContextValue["play"];
  pause: PlaybackContextValue["pause"];
  stop: PlaybackContextValue["stop"];
  setCurrentViewedFrame: PlaybackContextValue["setCurrentViewedFrame"];
  setPlaybackSpeed: PlaybackContextValue["setPlaybackSpeed"];
  setPlayMode: PlaybackContextValue["setPlayMode"];
};

/** Bundle of playback control actions. */
export function usePlaybackActions(): PlaybackActionsBundle {
  const ctx = use(PlaybackContext);
  return {
    play: ctx.play,
    pause: ctx.pause,
    stop: ctx.stop,
    setCurrentViewedFrame: ctx.setCurrentViewedFrame,
    setPlaybackSpeed: ctx.setPlaybackSpeed,
    setPlayMode: ctx.setPlayMode,
  };
}

/** Whether the user can currently switch to viewOnly mode. */
export function useIsViewOnlyAvailable(): boolean {
  return use(PlaybackContext).isViewOnlyAvailable;
}

/** Whether compute modes are available (simulation can still produce frames). */
export function useIsComputeAvailable(): boolean {
  return use(PlaybackContext).isComputeAvailable;
}

export type { PlayMode, PlaybackSpeed, PlaybackState };
