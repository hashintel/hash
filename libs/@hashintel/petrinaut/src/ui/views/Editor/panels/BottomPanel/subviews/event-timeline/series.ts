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
  "getEvent" | "getEventState" | "getStateAt" | "placeIndexById"
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
  | {
      kind: "steps";
      series: TimelineSeriesMeta[];
      data: uPlot.AlignedData;
      /**
       * The value the chart's y axis reaches at least, so a flat series is
       * not drawn across the whole height. Counts take the default of 1.
       */
      axisMinimum?: number;
      /** Set when the columns are bands: see {@link stackTimelineData}. */
      stacked?: true;
    }
  | {
      kind: "sampled";
      series: TimelineSeriesMeta[];
      data: uPlot.AlignedData;
      /** Set when the columns are bands: see {@link stackTimelineData}. */
      stacked?: true;
    }
  | {
      kind: "lanes";
      series: TimelineSeriesMeta[];
      data: uPlot.AlignedData;
      /** The transition name of each lane, bottom lane first. */
      laneLabels: string[];
    };

/**
 * The series a stacked chart draws: the visible ones, top band first, which
 * is the order uPlot fills bands in. Depends on the series list and the
 * hidden set alone, so it holds still while a run streams.
 */
export const stackedSeriesOf = (
  series: readonly TimelineSeriesMeta[],
  hiddenSeries: ReadonlySet<string>,
): TimelineSeriesMeta[] =>
  series.filter((entry) => !hiddenSeries.has(entry.seriesId)).reverse();

/**
 * The columns of a stacked chart: each band is its series plus every visible
 * series before it, in the order of {@link stackedSeriesOf}. A gap in a
 * series counts as nothing.
 */
export const stackColumns = (
  data: uPlot.AlignedData,
  series: readonly TimelineSeriesMeta[],
  hiddenSeries: ReadonlySet<string>,
): uPlot.AlignedData => {
  const time = data[0];
  const bands: number[][] = [];
  const total = new Float64Array(time.length);
  for (const [index, entry] of series.entries()) {
    if (hiddenSeries.has(entry.seriesId)) {
      continue;
    }
    const column = data[index + 1];
    const band = new Array<number>(time.length);
    for (let row = 0; row < time.length; row++) {
      const value = column?.[row];
      total[row] =
        total[row]! +
        (typeof value === "number" && !Number.isNaN(value) ? value : 0);
      band[row] = total[row]!;
    }
    bands.push(band);
  }
  return [time, ...bands.reverse()] as uPlot.AlignedData;
};

/**
 * What a band of a stacked chart holds on its own at `row`: its height above
 * the band under it. `seriesIndex` counts from 1, as uPlot numbers series.
 */
export const stackedBandValue = (
  data: uPlot.AlignedData,
  seriesIndex: number,
  row: number,
): number | undefined => {
  const top = data[seriesIndex]?.[row];
  if (typeof top !== "number") {
    return undefined;
  }
  const below = data[seriesIndex + 1]?.[row];
  return top - (typeof below === "number" ? below : 0);
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
