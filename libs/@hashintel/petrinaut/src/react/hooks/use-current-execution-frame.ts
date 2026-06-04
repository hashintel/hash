import { use, useMemo } from "react";

import {
  buildActualModeTimelinePoints,
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../actual-mode-context";
import { PlaybackContext } from "../playback/context";
import { EditorContext } from "../state/editor-context";
import { SDCPNContext } from "../state/sdcpn-context";

import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "@hashintel/petrinaut-core";

export type CurrentExecutionFrame = {
  currentFrameIndex: number;
  currentFrameReader: SimulationFrameReader | null;
  currentViewedFrame: SimulationFrameState | null;
  totalFrames: number;
};

export const useCurrentExecutionFrame = (): CurrentExecutionFrame => {
  const actualMode = use(ActualModeContext);
  const playback = use(PlaybackContext);
  const { globalMode } = use(EditorContext);
  const { petriNetDefinition } = use(SDCPNContext);

  const actualFrame = useMemo<CurrentExecutionFrame | null>(() => {
    if (
      globalMode !== "actual" ||
      !actualMode.available ||
      !actualMode.initialState
    ) {
      return null;
    }

    const timelinePoints = buildActualModeTimelinePoints({
      status: actualMode.status,
      transitionFirings: actualMode.transitionFirings,
      timelineStartedAtMs: actualMode.timelineStartedAtMs,
      timelineNowMs: actualMode.timelineNowMs,
    });

    if (timelinePoints.length === 0) {
      return {
        currentFrameIndex: 0,
        currentFrameReader: null,
        currentViewedFrame: null,
        totalFrames: 0,
      };
    }

    const currentFrameIndex = Math.min(
      actualMode.currentFrameIndex,
      timelinePoints.length - 1,
    );
    const transitionFiringTimesMs = getActualModeTransitionFiringTimesMs(
      actualMode.transitionFirings,
      actualMode.timelineStartedAtMs,
      actualMode.timelineNowMs,
    );
    const currentFrameReader = createActualModeTimelineFrameReader({
      definition: petriNetDefinition,
      initialState: actualMode.initialState,
      transitionFirings: actualMode.transitionFirings,
      transitionFiringTimesMs,
      point: timelinePoints[currentFrameIndex]!,
      number: currentFrameIndex,
    });

    return {
      currentFrameIndex,
      currentFrameReader,
      currentViewedFrame: currentFrameReader.toFrameState(),
      totalFrames: timelinePoints.length,
    };
  }, [
    actualMode.available,
    actualMode.currentFrameIndex,
    actualMode.initialState,
    actualMode.status,
    actualMode.timelineNowMs,
    actualMode.timelineStartedAtMs,
    actualMode.transitionFirings,
    globalMode,
    petriNetDefinition,
  ]);

  return actualFrame ?? playback;
};
