import { use } from "react";

import {
  EventPlaybackContext,
  type EventPlaybackContextValue,
} from "../event-playback/context";
import {
  ExecutionFrameSourceContext,
  type ExecutionFrameSource,
} from "../execution-frame/context";
import { useStoreSelector } from "../use-store";

import type {
  PlaybackSpeed,
  PlaybackState,
  PlayMode,
} from "@hashintel/petrinaut-core";

export function usePlaybackState(): PlaybackState {
  return use(EventPlaybackContext).playbackState;
}

/**
 * The viewed simulation time, in seconds. Re-renders the caller on every
 * animation frame while playing.
 */
export function usePlaybackTime(): number {
  return useStoreSelector(
    use(EventPlaybackContext).playbackStore,
    (snapshot) => snapshot.time,
  );
}

/**
 * Index of the frame in view: the last event the run recorded at or before
 * the viewed time.
 */
export function usePlaybackFrameIndex(): number {
  return use(ExecutionFrameSourceContext).currentFrameIndex;
}

export function usePlaybackSpeed(): PlaybackSpeed {
  return use(EventPlaybackContext).playbackSpeed;
}

export function usePlaybackMode(): PlayMode {
  return use(EventPlaybackContext).playMode;
}

/**
 * Reader for the state at the viewed time, or `null` if no simulation is
 * running.
 */
export function useCurrentFrameReader(): ExecutionFrameSource["currentFrameReader"] {
  return use(ExecutionFrameSourceContext).currentFrameReader;
}

export const useCurrentFrame = useCurrentFrameReader;

/** Simplified, UI-shaped view of the state at the viewed time. */
export function useCurrentViewedFrame(): ExecutionFrameSource["currentViewedFrame"] {
  return use(ExecutionFrameSourceContext).currentViewedFrame;
}

export type PlaybackActionsBundle = {
  play: EventPlaybackContextValue["play"];
  pause: EventPlaybackContextValue["pause"];
  stop: EventPlaybackContextValue["stop"];
  /** Views a simulation time, clamped to what the run has computed. */
  setTime: EventPlaybackContextValue["setTime"];
  /** Views the previous or next firing's time. */
  stepToEvent: EventPlaybackContextValue["stepToEvent"];
  /** Views the time of the frame at an index. */
  setCurrentViewedFrame: ExecutionFrameSource["scrubToFrame"];
  setPlaybackSpeed: EventPlaybackContextValue["setPlaybackSpeed"];
  setPlayMode: EventPlaybackContextValue["setPlayMode"];
};

/** Bundle of playback control actions. */
export function usePlaybackActions(): PlaybackActionsBundle {
  const playback = use(EventPlaybackContext);
  const { scrubToFrame } = use(ExecutionFrameSourceContext);
  return {
    play: playback.play,
    pause: playback.pause,
    stop: playback.stop,
    setTime: playback.setTime,
    stepToEvent: playback.stepToEvent,
    setCurrentViewedFrame: scrubToFrame,
    setPlaybackSpeed: playback.setPlaybackSpeed,
    setPlayMode: playback.setPlayMode,
  };
}

/** Whether the user can currently switch to viewOnly mode. */
export function useIsViewOnlyAvailable(): boolean {
  return use(EventPlaybackContext).isViewOnlyAvailable;
}

/** Whether compute modes are available (the run can still compute). */
export function useIsComputeAvailable(): boolean {
  return use(EventPlaybackContext).isComputeAvailable;
}

export type { PlayMode, PlaybackSpeed, PlaybackState };
