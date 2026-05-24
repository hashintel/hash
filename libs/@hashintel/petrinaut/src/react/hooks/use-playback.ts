import { use } from "react";

import { PlaybackContext, type PlaybackContextValue } from "../playback/context";

import type { PlaybackSpeed, PlaybackState, PlayMode } from "@hashintel/petrinaut-core";

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

/** Reader for the currently displayed frame, or `null` if no simulation is running. */
export function useCurrentFrameReader(): PlaybackContextValue["currentFrameReader"] {
  return use(PlaybackContext).currentFrameReader;
}

export const useCurrentFrame = useCurrentFrameReader;

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
