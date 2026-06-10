import { use, useState, type FC, type PropsWithChildren } from "react";

import {
  buildActualModeTimelinePoints,
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
} from "@hashintel/petrinaut-core";

import { ActualModeContext } from "../actual-mode-context";
import { PlaybackContext } from "../playback/context";
import { SimulationContext } from "../simulation/context";
import { EditorContext } from "../state/editor-context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  emptyExecutionFrameSource,
  ExecutionFrameSourceContext,
  type ExecutionFrameSource,
} from "./context";

import type { SimulationFrameReader } from "@hashintel/petrinaut-core";

/**
 * Adapter exposing local simulation playback as an {@link ExecutionFrameSource}.
 */
export const useSimulationExecutionFrameSource = (): ExecutionFrameSource => {
  const { dt, getFramesInRange, totalFrames } = use(SimulationContext);
  const {
    currentFrameIndex,
    currentFrameReader,
    currentViewedFrame,
    setCurrentViewedFrame,
  } = use(PlaybackContext);

  return {
    // dt participates in the identity because a dt change rescales the time
    // axis of everything derived from frame indices.
    sourceId: `simulation:${dt}`,
    totalFrames,
    currentFrameIndex,
    currentFrameReader,
    currentViewedFrame,
    scrubToFrame: setCurrentViewedFrame,
    getFramesInRange,
  };
};

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
  const currentPoint = timelinePoints[currentFrameIndex];
  const currentFrameReader = currentPoint
    ? createActualModeTimelineFrameReader({
        definition: petriNetDefinition,
        initialState,
        transitionFirings: actualMode.transitionFirings,
        transitionFiringTimesMs,
        point: currentPoint,
        number: currentFrameIndex,
      })
    : null;

  const getFramesInRange = async (
    startIndex: number,
    endIndex = timelinePoints.length,
  ): Promise<SimulationFrameReader[]> =>
    timelinePoints.slice(startIndex, endIndex).map((point, offset) =>
      createActualModeTimelineFrameReader({
        definition: petriNetDefinition,
        initialState,
        transitionFirings: actualMode.transitionFirings,
        transitionFiringTimesMs,
        point,
        number: startIndex + offset,
      }),
    );

  const { source } = actualMode;
  const baselineKey = getSourceBaselineKey(
    actualMode.transitionFirings,
    actualMode.timelineStartedAtMs,
  );

  return {
    sourceId: `actual:${source.kind}:${source.endpoint}:${
      source.runId ?? ""
    }:${baselineKey}`,
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

/**
 * Routes {@link ExecutionFrameSourceContext} to the adapter matching the
 * editor's global mode: the host-provided Actual mode stream in Actual mode,
 * local simulation playback otherwise. A single element provides the context
 * so switching modes swaps the value without remounting the subtree.
 */
export const ExecutionFrameProvider: FC<PropsWithChildren> = ({ children }) => {
  const { globalMode } = use(EditorContext);
  const isActualMode = globalMode === "actual";
  const simulationSource = useSimulationExecutionFrameSource();
  const actualSource = useActualExecutionFrameSource({
    enabled: isActualMode,
  });

  return (
    <ExecutionFrameSourceContext
      value={isActualMode ? actualSource : simulationSource}
    >
      {children}
    </ExecutionFrameSourceContext>
  );
};
