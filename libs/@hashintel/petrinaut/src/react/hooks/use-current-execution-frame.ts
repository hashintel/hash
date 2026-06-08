import { use } from "react";

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

  let actualFrame: CurrentExecutionFrame | null = null;

  if (
    globalMode === "actual" &&
    actualMode.available &&
    actualMode.initialState
  ) {
    const timelinePoints = buildActualModeTimelinePoints({
      status: actualMode.status,
      transitionFirings: actualMode.transitionFirings,
      timelineStartedAtMs: actualMode.timelineStartedAtMs,
      timelineNowMs: actualMode.timelineNowMs,
    });

    if (timelinePoints.length === 0) {
      actualFrame = {
        currentFrameIndex: 0,
        currentFrameReader: null,
        currentViewedFrame: null,
        totalFrames: 0,
      };
    } else {
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

      actualFrame = {
        currentFrameIndex,
        currentFrameReader,
        currentViewedFrame: currentFrameReader.toFrameState(),
        totalFrames: timelinePoints.length,
      };
    }
  }

  return actualFrame ?? playback;
};
