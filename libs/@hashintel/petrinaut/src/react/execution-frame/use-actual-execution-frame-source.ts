import { use, useState } from "react";

import {
  buildActualModeTimelinePoints,
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../host/actual-mode-context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  emptyExecutionFrameSource,
  type ExecutionFrameSource,
} from "./context";

import type { SimulationFrameReader } from "@hashintel/petrinaut-core";

const parseTimestampMs = (timestamp: string): number | null => {
  const parsed = Date.parse(timestamp);

  return Number.isFinite(parsed) ? parsed : null;
};

const getSourceBaselineKey = (
  transitionFirings: readonly { ts: string }[],
  timelineStartedAtMs: number | null,
): string => {
  for (const firing of transitionFirings) {
    const timestampMs = parseTimestampMs(firing.ts);

    if (timestampMs !== null) {
      return String(timestampMs);
    }
  }

  return String(timelineStartedAtMs ?? "pending");
};

/**
 * Adapter exposing a host-provided Actual mode stream as an
 * {@link ExecutionFrameSource}.
 *
 * Timeline points, the current frame reader, and the viewed-frame index are
 * all derived here, in one place, for both the canvas and the timeline chart.
 * Pass `enabled: false` while another source is active so the adapter skips
 * deriving frames from a stream nobody is looking at.
 */
export const useActualExecutionFrameSource = (params: {
  enabled: boolean;
}): ExecutionFrameSource => {
  const actualMode = use(ActualModeContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const [scrubbedFrameIndex, setScrubbedFrameIndex] = useState(0);

  const initialState =
    params.enabled && actualMode.available ? actualMode.initialState : null;

  if (!actualMode.available || initialState === null) {
    return emptyExecutionFrameSource;
  }

  const timelinePoints = buildActualModeTimelinePoints({
    status: actualMode.status,
    transitionFirings: actualMode.transitionFirings,
    timelineStartedAtMs: actualMode.timelineStartedAtMs,
    timelineNowMs: actualMode.timelineNowMs,
  });
  const transitionFiringTimesMs = getActualModeTransitionFiringTimesMs(
    actualMode.transitionFirings,
    actualMode.timelineStartedAtMs,
    actualMode.timelineNowMs,
  );

  const totalFrames = timelinePoints.length;
  const currentFrameIndex = Math.min(
    scrubbedFrameIndex,
    Math.max(0, totalFrames - 1),
  );
  const readerAt = (
    point: (typeof timelinePoints)[number],
    number: number,
  ): SimulationFrameReader =>
    createActualModeTimelineFrameReader({
      definition: petriNetDefinition,
      initialState,
      transitionFirings: actualMode.transitionFirings,
      transitionFiringTimesMs,
      point,
      number,
    });
  const currentPoint = timelinePoints[currentFrameIndex];
  const currentFrameReader = currentPoint
    ? readerAt(currentPoint, currentFrameIndex)
    : null;

  const getFramesInRange = async (
    startIndex: number,
    endIndex?: number,
  ): Promise<SimulationFrameReader[]> =>
    timelinePoints
      .slice(startIndex, endIndex)
      .map((point, offset) => readerAt(point, startIndex + offset));

  const { source } = actualMode;
  const baselineKey = getSourceBaselineKey(
    actualMode.transitionFirings,
    actualMode.timelineStartedAtMs,
  );

  return {
    sourceId: `actual:${source.id}:${baselineKey}`,
    totalFrames,
    currentFrameIndex,
    currentFrameReader,
    currentViewedFrame: currentFrameReader?.toFrameState() ?? null,
    scrubToFrame: (frameIndex: number) => {
      setScrubbedFrameIndex(Math.max(0, Math.floor(frameIndex)));
    },
    getFramesInRange,
  };
};
