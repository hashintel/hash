import { describe, expect, it } from "vitest";

import { placeMeanTimeline } from "./stochastic-series";

import type { TimelineSeriesMeta } from "../simulation-timeline/types";
import type {
  CountStatistics,
  ExperimentReader,
  MonteCarloUserDefinedMetricFrame,
} from "@hashintel/petrinaut-core";

const series: TimelineSeriesMeta[] = [
  { seriesId: "a", seriesName: "A", color: "#a00" },
  { seriesId: "b", seriesName: "B", color: "#0b0" },
];

/** A frame whose mean is the value it was made with. */
const frame = (time: number, mean: number) =>
  ({ time, mean }) as unknown as MonteCarloUserDefinedMetricFrame;

const readerOf = (
  columns: Record<string, MonteCarloUserDefinedMetricFrame[]>,
): ExperimentReader =>
  ({
    metricFrames: (metricId: string) => columns[metricId] ?? [],
    statisticsOf: (given: MonteCarloUserDefinedMetricFrame) =>
      ({
        mean: (given as unknown as { mean: number }).mean,
      }) as CountStatistics,
  }) as unknown as ExperimentReader;

const metricIdOf = (seriesId: string) => `count:${seriesId}`;

describe("placeMeanTimeline", () => {
  it("draws each place's mean across runs at every sample", () => {
    const columns = {
      "count:a": [frame(0, 10), frame(0.1, 9), frame(0.2, 7.5)],
      "count:b": [frame(0, 0), frame(0.1, 1), frame(0.2, 2.5)],
    };
    const frames = Object.values(columns).flat();
    expect(
      placeMeanTimeline(readerOf(columns), series, metricIdOf, frames),
    ).toEqual({
      kind: "sampled",
      series,
      data: [
        [0, 0.1, 0.2],
        [10, 9, 7.5],
        [0, 1, 2.5],
      ],
    });
  });

  it("stops where the shortest series does, so every row is whole", () => {
    const columns = {
      "count:a": [frame(0, 10), frame(0.1, 9), frame(0.2, 7.5)],
      "count:b": [frame(0, 0), frame(0.1, 1)],
    };
    const data = placeMeanTimeline(
      readerOf(columns),
      series,
      metricIdOf,
      Object.values(columns).flat(),
    );
    expect(data?.data).toEqual([
      [0, 0.1],
      [10, 9],
      [0, 1],
    ]);
  });

  it("has nothing to draw before the first sample", () => {
    expect(placeMeanTimeline(readerOf({}), series, metricIdOf, [])).toBeNull();
  });
});
