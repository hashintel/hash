/**
 * The columns the event timeline draws, built from the trace by the series
 * store rather than streamed frame by frame.
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

import type { TimelineSeriesMeta } from "../simulation-timeline/types";
import type { EventSimulation } from "@hashintel/petrinaut-core";
import type uPlot from "uplot";

/** What the timeline reads from a run. */
export type TraceReader = Pick<
  EventSimulation,
  "getEvent" | "getEventState" | "getStateAt"
>;

/**
 * Transitions carry no colour of their own, so every firing is marked in
 * this one neutral tone, on the ruler and in the lanes alike.
 */
export const FIRING_COLOR = "#475569";

export type FiringMark = {
  time: number;
  transitionIds: readonly string[];
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
