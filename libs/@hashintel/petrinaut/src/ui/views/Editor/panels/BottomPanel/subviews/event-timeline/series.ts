/**
 * The columns the event timeline draws, built from the trace rather than
 * streamed frame by frame.
 *
 * Three shapes, by what the view tracks:
 *
 * - `steps`: a value per recorded event, drawn as a step function, for
 *   quantities that only change at events (token counts).
 * - `sampled`: the interpolated state read on a time grid over the visible
 *   range, for quantities that evolve between events (a user metric over
 *   token attributes).
 * - `lanes`: one lane per transition with a mark at every event it fired at.
 */

import { DEFAULT_COLORS } from "../simulation-timeline/default-colors";

import type {
  TimelineSeriesExtractor,
  TimelineSeriesMeta,
} from "../simulation-timeline/types";
import type { EventSimulation, Transition } from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

/** What the timeline reads from a run. */
export type TraceReader = Pick<
  EventSimulation,
  "getEvent" | "getEventState" | "getStateAt"
>;

export type FiringMark = {
  time: number;
  transitionIds: readonly string[];
  /** The colour of the first transition that fired. */
  color: string;
};

export type EventTimelineData =
  | { kind: "steps"; series: TimelineSeriesMeta[]; data: uPlot.AlignedData }
  | { kind: "sampled"; series: TimelineSeriesMeta[]; data: uPlot.AlignedData }
  | {
      kind: "lanes";
      series: TimelineSeriesMeta[];
      data: uPlot.AlignedData;
      /** The transition name of each lane, bottom lane first. */
      laneLabels: string[];
    };

/**
 * One row per event: its time and each series' value at the state it
 * recorded, plus a last row holding the final values to `coveredTime`, so
 * the step function reaches the end of what is computed.
 */
export const buildStepData = (
  trace: TraceReader,
  eventCount: number,
  coveredTime: number,
  series: readonly TimelineSeriesMeta[],
  extract: TimelineSeriesExtractor,
): uPlot.AlignedData => {
  const times: number[] = [];
  const columns = series.map((): (number | null)[] => []);
  for (let index = 0; index < eventCount; index++) {
    const event = trace.getEvent(index);
    const reader = trace.getEventState(index);
    if (!event || !reader) {
      continue;
    }
    times.push(event.time);
    for (const [seriesIndex, column] of columns.entries()) {
      column.push(extract(reader, seriesIndex, event.time));
    }
  }
  const lastTime = times[times.length - 1];
  if (lastTime !== undefined && coveredTime > lastTime) {
    times.push(coveredTime);
    for (const column of columns) {
      column.push(column[column.length - 1] ?? null);
    }
  }
  return [times, ...columns] as uPlot.AlignedData;
};

/**
 * `count` samples of each series over `[from, to]`, read from the state the
 * trace interpolates at each sample time.
 */
export const buildSampledData = (
  trace: TraceReader,
  from: number,
  to: number,
  count: number,
  series: readonly TimelineSeriesMeta[],
  extract: TimelineSeriesExtractor,
): uPlot.AlignedData => {
  const times: number[] = [];
  const columns = series.map((): (number | null)[] => []);
  const samples = Math.max(2, count);
  for (let sample = 0; sample < samples; sample++) {
    const time = from + ((to - from) * sample) / (samples - 1);
    const reader = trace.getStateAt(time);
    if (!reader) {
      continue;
    }
    times.push(time);
    for (const [seriesIndex, column] of columns.entries()) {
      column.push(extract(reader, seriesIndex, time));
    }
  }
  return [times, ...columns] as uPlot.AlignedData;
};

/**
 * One lane per transition, the first transition on top: a point at the lane's
 * height for every event the transition fired at, and a gap elsewhere.
 */
export const buildLaneData = (
  trace: TraceReader,
  eventCount: number,
  transitions: readonly Transition[],
): Extract<EventTimelineData, { kind: "lanes" }> => {
  const laneOf = new Map(
    transitions.map((transition, index) => [
      transition.id,
      transitions.length - 1 - index,
    ]),
  );
  const times: number[] = [];
  const columns = transitions.map((): (number | null)[] => []);
  for (let index = 0; index < eventCount; index++) {
    const event = trace.getEvent(index);
    if (!event || event.firedTransitionIds.length === 0) {
      continue;
    }
    times.push(event.time);
    const fired = new Set(event.firedTransitionIds);
    for (const [transitionIndex, transition] of transitions.entries()) {
      columns[transitionIndex]!.push(
        fired.has(transition.id) ? laneOf.get(transition.id)! : null,
      );
    }
  }
  return {
    kind: "lanes",
    series: transitions.map((transition, index) => ({
      seriesId: `transition__${transition.id}`,
      seriesName: transition.name,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
    })),
    data: [times, ...columns] as uPlot.AlignedData,
    laneLabels: [...transitions].reverse().map((transition) => transition.name),
  };
};

/** The colour each transition's firings are marked with, by net order. */
export const transitionColors = (
  transitions: readonly Transition[],
): Map<string, string> =>
  new Map(
    transitions.map((transition, index) => [
      transition.id,
      DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
    ]),
  );

/** Every firing in the trace, in time order. */
export const collectFirings = (
  trace: TraceReader,
  eventCount: number,
  colors: ReadonlyMap<string, string>,
): FiringMark[] => {
  const firings: FiringMark[] = [];
  for (let index = 0; index < eventCount; index++) {
    const event = trace.getEvent(index);
    const first = event?.firedTransitionIds[0];
    if (!event || first === undefined) {
      continue;
    }
    firings.push({
      time: event.time,
      transitionIds: event.firedTransitionIds,
      color: colors.get(first) ?? DEFAULT_COLORS[0]!,
    });
  }
  return firings;
};

/** The firing nearest to `time`, when one lies within `tolerance` of it. */
export const findFiringNear = (
  firings: readonly FiringMark[],
  time: number,
  tolerance: number,
): FiringMark | null => {
  let low = 0;
  let high = firings.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (firings[middle]!.time < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const candidates = [firings[low - 1], firings[low]].filter(
    (firing): firing is FiringMark => firing !== undefined,
  );
  let nearest: FiringMark | null = null;
  for (const firing of candidates) {
    const distance = Math.abs(firing.time - time);
    if (
      distance <= tolerance &&
      (nearest === null || distance < Math.abs(nearest.time - time))
    ) {
      nearest = firing;
    }
  }
  return nearest;
};
