import { z } from "zod";

import { sdcpnSchema } from "./file-format/types";

import type {
  SimulationFrameReader,
  SimulationFrameState,
  SimulationPlaceTokenValues,
} from "./simulation/api";
import type { Color, Place, SDCPN } from "./types/sdcpn";

/**
 * Host-provided live execution state for Petrinaut's Actual mode.
 *
 * Core owns the transport-neutral data contract. React packages provide the
 * concrete context/provider surface for UI consumption.
 */

export type ActualModeTokenColour = Record<string, number>;

export type ActualModeMarking = Record<
  string,
  number | ActualModeTokenColour[]
>;

export type ActualModeTransitionEffect = Record<string, number>;

export type ActualModeTransitionFiring = {
  transitionId: string;
  input: ActualModeTransitionEffect;
  output: ActualModeTransitionEffect;
  ts: string;
};

export type ActualModeSource = {
  kind: "brunch";
  endpoint: string;
  runId?: string;
};

export type ActualModeRecording = {
  version: typeof ACTUAL_MODE_RECORDING_VERSION;
  exportedAt: string;
  title: string | null;
  source: ActualModeSource | null;
  definition: SDCPN;
  initialState: ActualModeMarking;
  transitionFirings: ActualModeTransitionFiring[];
};

export type ActualModeContextValue =
  | {
      available: false;
      source: null;
      status: "unavailable";
      title: null;
      definition: null;
      initialState: null;
      transitionFirings: readonly [];
      currentFrameIndex: 0;
      timelineStartedAtMs: null;
      timelineNowMs: null;
      setCurrentFrameIndex: (frameIndex: number) => void;
      error: null;
    }
  | {
      available: true;
      source: ActualModeSource;
      status: "loading" | "streaming" | "complete" | "error";
      title: string | null;
      definition: SDCPN | null;
      initialState: ActualModeMarking | null;
      transitionFirings: readonly ActualModeTransitionFiring[];
      currentFrameIndex: number;
      timelineStartedAtMs: number | null;
      timelineNowMs: number | null;
      setCurrentFrameIndex: (frameIndex: number) => void;
      error: string | null;
    };

export type ActualModeTimelinePointKind =
  | "initial"
  | "transition_firing"
  | "tick";

export type ActualModeTimelinePoint = {
  kind: ActualModeTimelinePointKind;
  timeMs: number;
  transitionFiringIndex: number | null;
};

export const ACTUAL_MODE_TIMELINE_TICK_MS = 500;
export const ACTUAL_MODE_RECORDING_VERSION = 1;

const isTokenColourArray = (
  markingValue: number | ActualModeTokenColour[] | undefined,
): markingValue is ActualModeTokenColour[] => Array.isArray(markingValue);

const getPlaceMarkingTokenCount = (
  markingValue: number | ActualModeTokenColour[] | undefined,
): number => {
  if (markingValue === undefined) {
    return 0;
  }

  return isTokenColourArray(markingValue) ? markingValue.length : markingValue;
};

const cloneTokenColour = (
  token: ActualModeTokenColour,
): ActualModeTokenColour => ({ ...token });

const cloneMarkingValue = (
  markingValue: number | ActualModeTokenColour[],
): number | ActualModeTokenColour[] =>
  Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenColour(token))
    : markingValue;

const cloneMarking = (marking: ActualModeMarking): ActualModeMarking =>
  Object.fromEntries(
    Object.entries(marking).map(([placeId, value]) => [
      placeId,
      cloneMarkingValue(value),
    ]),
  );

const emptyTokens = (count: number): ActualModeTokenColour[] =>
  Array.from({ length: Math.max(0, Math.floor(count)) }, () => ({}));

const toTokenArray = (
  markingValue: number | ActualModeTokenColour[] | undefined,
): ActualModeTokenColour[] => {
  if (markingValue === undefined) {
    return [];
  }

  return Array.isArray(markingValue)
    ? markingValue.map((token) => cloneTokenColour(token))
    : emptyTokens(markingValue);
};

export const applyActualModeTransitionFiring = (
  marking: ActualModeMarking,
  firing: ActualModeTransitionFiring,
): ActualModeMarking => {
  const next = cloneMarking(marking);
  const placeIds = new Set([
    ...Object.keys(next),
    ...Object.keys(firing.input),
    ...Object.keys(firing.output),
  ]);

  for (const placeId of placeIds) {
    const currentValue = next[placeId];
    const inputValue = firing.input[placeId];
    const outputValue = firing.output[placeId];

    if (
      Array.isArray(currentValue) ||
      Array.isArray(inputValue) ||
      Array.isArray(outputValue)
    ) {
      const currentTokens = toTokenArray(currentValue);
      const inputCount = getPlaceMarkingTokenCount(inputValue);
      const outputTokens = toTokenArray(outputValue);
      next[placeId] = currentTokens.slice(inputCount).concat(outputTokens);
      continue;
    }

    next[placeId] =
      (currentValue ?? 0) - (inputValue ?? 0) + (outputValue ?? 0);
  }

  return next;
};

export const getActualModeMarkingAtTransitionFiringIndex = (params: {
  initialState: ActualModeMarking;
  transitionFirings: readonly ActualModeTransitionFiring[];
  transitionFiringIndex: number | null;
}): ActualModeMarking => {
  const { initialState, transitionFiringIndex, transitionFirings } = params;

  if (transitionFiringIndex === null) {
    return initialState;
  }

  let marking = initialState;

  for (let index = 0; index <= transitionFiringIndex; index += 1) {
    const firing = transitionFirings[index];

    if (firing) {
      marking = applyActualModeTransitionFiring(marking, firing);
    }
  }

  return marking;
};

const actualModeTokenColourSchema = z.record(z.string(), z.number());
const actualModeMarkingValueSchema = z.union([
  z.number(),
  z.array(actualModeTokenColourSchema),
]);
export const actualModeMarkingSchema = z.record(
  z.string(),
  actualModeMarkingValueSchema,
) satisfies z.ZodType<ActualModeMarking>;
export const actualModeTransitionEffectSchema = z.record(
  z.string(),
  z.number(),
) satisfies z.ZodType<ActualModeTransitionEffect>;
const actualModeTransitionFiringEffectSchema = z
  .object({
    transitionId: z.string(),
    input: actualModeTransitionEffectSchema,
    output: actualModeTransitionEffectSchema,
    ts: z.string(),
  })
  .strict();
export const actualModeTransitionFiringSchema =
  actualModeTransitionFiringEffectSchema satisfies z.ZodType<ActualModeTransitionFiring>;
export const actualModeSourceSchema = z.object({
  kind: z.literal("brunch"),
  endpoint: z.string(),
  runId: z.string().optional(),
}) satisfies z.ZodType<ActualModeSource>;
const actualModeRecordingDefinitionSchema = z.custom<SDCPN>(
  (value) => sdcpnSchema.safeParse(value).success,
  { message: "Invalid SDCPN definition" },
);
export const actualModeRecordingSchema = z.object({
  version: z.literal(ACTUAL_MODE_RECORDING_VERSION),
  exportedAt: z.string(),
  title: z.string().nullable(),
  source: actualModeSourceSchema.nullable(),
  definition: actualModeRecordingDefinitionSchema,
  initialState: actualModeMarkingSchema,
  transitionFirings: z.array(actualModeTransitionFiringSchema),
}) satisfies z.ZodType<ActualModeRecording>;

const noopSetCurrentFrameIndex = () => {};

export const unavailableActualMode: ActualModeContextValue = {
  available: false,
  source: null,
  status: "unavailable",
  title: null,
  definition: null,
  initialState: null,
  transitionFirings: [],
  currentFrameIndex: 0,
  timelineStartedAtMs: null,
  timelineNowMs: null,
  setCurrentFrameIndex: noopSetCurrentFrameIndex,
  error: null,
};

const parseTimestampMs = (timestamp: string): number | null => {
  const parsed = Date.parse(timestamp);

  return Number.isFinite(parsed) ? parsed : null;
};

const parseRequiredTimestampMs = (timestamp: string): number => {
  const timestampMs = parseTimestampMs(timestamp);

  if (timestampMs === null) {
    throw new Error(`Invalid Actual mode event timestamp: ${timestamp}`);
  }

  return timestampMs;
};

export const createActualModeRecording = (params: {
  title: string | null;
  source: ActualModeSource | null;
  definition: SDCPN;
  initialState: ActualModeMarking;
  transitionFirings: readonly ActualModeTransitionFiring[];
  exportedAt?: string;
}): ActualModeRecording => ({
  version: ACTUAL_MODE_RECORDING_VERSION,
  exportedAt: params.exportedAt ?? new Date().toISOString(),
  title: params.title,
  source: params.source,
  definition: params.definition,
  initialState: params.initialState,
  transitionFirings: params.transitionFirings.map((firing) => ({ ...firing })),
});

export const parseActualModeRecording = (data: unknown): ActualModeRecording =>
  actualModeRecordingSchema.parse(data);

export const retimeActualModeRecordingForReplay = (
  recording: ActualModeRecording,
  launchTimeMs = Date.now(),
): ActualModeRecording => {
  const firstFiring = recording.transitionFirings[0];

  if (!firstFiring) {
    return { ...recording, transitionFirings: [] };
  }

  const firstTimestampMs = parseRequiredTimestampMs(firstFiring.ts);
  const deltaMs = launchTimeMs - firstTimestampMs;

  return {
    ...recording,
    transitionFirings: recording.transitionFirings.map((firing) => ({
      ...firing,
      ts: new Date(parseRequiredTimestampMs(firing.ts) + deltaMs).toISOString(),
    })),
  };
};

const getTimelineBaselineMs = (
  transitionFirings: readonly ActualModeTransitionFiring[],
  timelineStartedAtMs: number | null,
  timelineNowMs: number | null,
): number => {
  for (const firing of transitionFirings) {
    const timestampMs = parseTimestampMs(firing.ts);

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
    const timestampMs = parseTimestampMs(firing.ts);
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
      getPlaceMarkingTokenCount(marking[placeId]),
    getPlaceTokenValues: (
      placeId: string,
    ): SimulationPlaceTokenValues | null => {
      const place = definition.places.find(
        (candidatePlace) => candidatePlace.id === placeId,
      );
      const color = place
        ? definition.types.find((type) => type.id === place.colorId)
        : null;
      const placeMarking = marking[placeId];

      if (!place || !color || !isTokenColourArray(placeMarking)) {
        return {
          count: getPlaceMarkingTokenCount(placeMarking),
          values: new Float64Array(),
        };
      }

      const values = new Float64Array(
        placeMarking.length * color.elements.length,
      );

      for (const [tokenIndex, token] of placeMarking.entries()) {
        for (const [elementIndex, element] of color.elements.entries()) {
          values[tokenIndex * color.elements.length + elementIndex] =
            token[element.name] ?? token[element.elementId] ?? 0;
        }
      }

      return {
        count: placeMarking.length,
        values,
      };
    },
    getPlaceTokens: (
      place: Place,
      color: Color | null | undefined,
    ): Record<string, number>[] => {
      const placeMarking = marking[place.id];

      if (!color || !isTokenColourArray(placeMarking)) {
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
          { tokenCount: getPlaceMarkingTokenCount(marking[place.id]) },
        ]),
      ),
    }),
  };
};
