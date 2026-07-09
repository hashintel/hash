import { ACTUAL_MODE_TIMELINE_TICK_MS } from "./constants";
import {
  getActualModeMarkingAtTransitionFiringIndex,
  getActualModePlaceMarkingTokenCount,
  isActualModeTokenColourArray,
} from "./marking";
import { parseActualModeTimestampMs } from "./time";

import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "../simulation/api";
import type { Place, SDCPN } from "../types/sdcpn";
import type {
  ActualModeContextValue,
  ActualModeMarking,
  ActualModeTimelinePoint,
  ActualModeTimelinePointKind,
  ActualModeTransitionFiring,
} from "./types";

const getTimelineBaselineMs = (
  transitionFirings: readonly ActualModeTransitionFiring[],
  timelineStartedAtMs: number | null,
  timelineNowMs: number | null,
): number => {
  for (const firing of transitionFirings) {
    const timestampMs = parseActualModeTimestampMs(firing.ts);

    if (timestampMs !== null) {
      return timestampMs;
    }
  }

  return timelineStartedAtMs ?? timelineNowMs ?? 0;
};

export const getActualModeTransitionFiringTimesMs = (
  transitionFirings: readonly ActualModeTransitionFiring[],
  timelineStartedAtMs: number | null,
  timelineNowMs: number | null,
): readonly number[] => {
  const baselineMs = getTimelineBaselineMs(
    transitionFirings,
    timelineStartedAtMs,
    timelineNowMs,
  );
  const times: number[] = [];

  for (const firing of transitionFirings) {
    const timestampMs = parseActualModeTimestampMs(firing.ts);
    const previousTimeMs = times.at(-1) ?? 0;
    const nextTimeMs =
      timestampMs === null
        ? previousTimeMs + 1
        : Math.max(previousTimeMs, timestampMs - baselineMs);

    times.push(nextTimeMs);
  }

  return times;
};

export const buildActualModeTimelinePoints = (params: {
  status: ActualModeContextValue["status"];
  transitionFirings: readonly ActualModeTransitionFiring[];
  timelineStartedAtMs: number | null;
  timelineNowMs: number | null;
}): readonly ActualModeTimelinePoint[] => {
  const { status, transitionFirings, timelineStartedAtMs, timelineNowMs } =
    params;
  const transitionFiringTimesMs = getActualModeTransitionFiringTimesMs(
    transitionFirings,
    timelineStartedAtMs,
    timelineNowMs,
  );
  const points: ActualModeTimelinePoint[] = [
    { kind: "initial", timeMs: 0, transitionFiringIndex: null },
  ];

  for (const [
    transitionFiringIndex,
    timeMs,
  ] of transitionFiringTimesMs.entries()) {
    points.push({
      kind: "transition_firing",
      timeMs,
      transitionFiringIndex,
    });
  }

  if (status === "streaming") {
    const baselineMs = getTimelineBaselineMs(
      transitionFirings,
      timelineStartedAtMs,
      timelineNowMs,
    );
    const nowTimeMs =
      timelineNowMs !== null ? Math.max(0, timelineNowMs - baselineMs) : 0;
    const latestEventTimeMs = transitionFiringTimesMs.at(-1) ?? 0;
    const liveTimeMs = Math.max(nowTimeMs, latestEventTimeMs);
    const occupiedTimes = new Set(points.map((point) => point.timeMs));
    let latestTransitionFiringIndex = -1;

    for (
      let timeMs = ACTUAL_MODE_TIMELINE_TICK_MS;
      timeMs <= liveTimeMs;
      timeMs += ACTUAL_MODE_TIMELINE_TICK_MS
    ) {
      let nextTransitionFiringIndex = latestTransitionFiringIndex + 1;

      while (
        nextTransitionFiringIndex < transitionFiringTimesMs.length &&
        transitionFiringTimesMs[nextTransitionFiringIndex]! <= timeMs
      ) {
        latestTransitionFiringIndex = nextTransitionFiringIndex;
        nextTransitionFiringIndex = latestTransitionFiringIndex + 1;
      }

      if (occupiedTimes.has(timeMs)) {
        continue;
      }

      points.push({
        kind: "tick",
        timeMs,
        transitionFiringIndex:
          latestTransitionFiringIndex >= 0 ? latestTransitionFiringIndex : null,
      });
    }
  }

  return points.sort((left, right) => {
    if (left.timeMs !== right.timeMs) {
      return left.timeMs - right.timeMs;
    }

    const order: Record<ActualModeTimelinePointKind, number> = {
      initial: 0,
      transition_firing: 1,
      tick: 2,
    };

    return order[left.kind] - order[right.kind];
  });
};

const getTransitionFiringCount = (
  transitionFirings: readonly ActualModeTransitionFiring[],
  transitionId: string,
  transitionFiringIndex: number | null,
): number => {
  if (transitionFiringIndex === null) {
    return 0;
  }

  let firingCount = 0;

  for (let index = 0; index <= transitionFiringIndex; index += 1) {
    if (transitionFirings[index]?.transitionId === transitionId) {
      firingCount += 1;
    }
  }

  return firingCount;
};

export const createActualModeTimelineFrameReader = (params: {
  definition: Pick<SDCPN, "places" | "transitions" | "types">;
  initialState: ActualModeMarking;
  transitionFirings: readonly ActualModeTransitionFiring[];
  transitionFiringTimesMs: readonly number[];
  point: ActualModeTimelinePoint;
  number: number;
}): SimulationFrameReader => {
  const {
    definition,
    initialState,
    number,
    point,
    transitionFirings,
    transitionFiringTimesMs,
  } = params;
  const marking = getActualModeMarkingAtTransitionFiringIndex({
    initialState,
    transitionFirings,
    transitionFiringIndex: point.transitionFiringIndex,
  });

  return {
    number,
    time: point.timeMs / 1_000,
    getPlaceTokenCount: (placeId: string) =>
      getActualModePlaceMarkingTokenCount(marking[placeId]),
    getPlaceTokens: (place: Place): Record<string, number>[] => {
      const placeMarking = marking[place.id];

      if (!place.colorId || !isActualModeTokenColourArray(placeMarking)) {
        return [];
      }

      return placeMarking.map((token) => ({ ...token }));
    },
    getTransitionState: (transitionId: string) => {
      const firedInThisFrame =
        point.kind === "transition_firing" &&
        point.transitionFiringIndex !== null &&
        transitionFirings[point.transitionFiringIndex]?.transitionId ===
          transitionId;
      const firingCount = getTransitionFiringCount(
        transitionFirings,
        transitionId,
        point.transitionFiringIndex,
      );
      let lastFiringTimeMs: number | null = null;

      if (point.transitionFiringIndex !== null) {
        for (let index = point.transitionFiringIndex; index >= 0; index -= 1) {
          if (transitionFirings[index]?.transitionId === transitionId) {
            lastFiringTimeMs = transitionFiringTimesMs[index] ?? null;
            break;
          }
        }
      }

      return {
        firedInThisFrame,
        firingCount,
        timeSinceLastFiringMs:
          lastFiringTimeMs === null
            ? point.timeMs
            : Math.max(0, point.timeMs - lastFiringTimeMs),
      };
    },
    toFrameState: (): SimulationFrameState => ({
      number,
      places: Object.fromEntries(
        definition.places.map((place) => [
          place.id,
          {
            tokenCount: getActualModePlaceMarkingTokenCount(marking[place.id]),
          },
        ]),
      ),
    }),
  };
};
