import { use, useCallback, useMemo } from "react";

import {
  buildActualModeTimelinePoints,
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../../../../../../../react/actual-mode-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";

import type { TimelineFrameSource } from "./types";
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

export const useActualTimelineSource = (): {
  currentFrameIndex: number;
  isAvailable: boolean;
  setCurrentFrameIndex: (frameIndex: number) => void;
  source: TimelineFrameSource;
} => {
  const actualMode = use(ActualModeContext);
  const { petriNetDefinition } = use(SDCPNContext);

  const timelinePoints = useMemo(
    () =>
      buildActualModeTimelinePoints({
        status: actualMode.status,
        transitionFirings: actualMode.transitionFirings,
        timelineStartedAtMs: actualMode.timelineStartedAtMs,
        timelineNowMs: actualMode.timelineNowMs,
      }),
    [
      actualMode.status,
      actualMode.timelineNowMs,
      actualMode.timelineStartedAtMs,
      actualMode.transitionFirings,
    ],
  );
  const transitionFiringTimesMs = useMemo(
    () =>
      getActualModeTransitionFiringTimesMs(
        actualMode.transitionFirings,
        actualMode.timelineStartedAtMs,
        actualMode.timelineNowMs,
      ),
    [
      actualMode.timelineNowMs,
      actualMode.timelineStartedAtMs,
      actualMode.transitionFirings,
    ],
  );

  const getFramesInRange = useCallback(
    async (
      startIndex: number,
      endIndex = timelinePoints.length,
    ): Promise<SimulationFrameReader[]> => {
      const initialState = actualMode.initialState;

      if (!initialState) {
        return [];
      }

      return timelinePoints.slice(startIndex, endIndex).map((point, offset) =>
        createActualModeTimelineFrameReader({
          definition: petriNetDefinition,
          initialState,
          transitionFirings: actualMode.transitionFirings,
          transitionFiringTimesMs,
          point,
          number: startIndex + offset,
        }),
      );
    },
    [
      actualMode.initialState,
      actualMode.transitionFirings,
      petriNetDefinition,
      timelinePoints,
      transitionFiringTimesMs,
    ],
  );

  const sourceId = useMemo(() => {
    const source = actualMode.source;
    const sourceName = source
      ? `${source.kind}:${source.endpoint}:${source.runId ?? ""}`
      : "unavailable";
    const baselineKey = getSourceBaselineKey(
      actualMode.transitionFirings,
      actualMode.timelineStartedAtMs,
    );

    return `actual:${sourceName}:${baselineKey}`;
  }, [
    actualMode.source,
    actualMode.timelineStartedAtMs,
    actualMode.transitionFirings,
  ]);

  const source = useMemo<TimelineFrameSource>(
    () => ({
      sourceId,
      totalFrames: actualMode.initialState ? timelinePoints.length : 0,
      getFramesInRange,
    }),
    [
      actualMode.initialState,
      getFramesInRange,
      sourceId,
      timelinePoints.length,
    ],
  );

  return {
    currentFrameIndex: actualMode.currentFrameIndex,
    isAvailable: actualMode.available && actualMode.initialState !== null,
    setCurrentFrameIndex: actualMode.setCurrentFrameIndex,
    source,
  };
};
