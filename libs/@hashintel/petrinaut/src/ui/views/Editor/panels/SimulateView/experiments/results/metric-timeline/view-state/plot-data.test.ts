import { describe, expect, it } from "vitest";

import { buildDistributionBarData, buildMetricTimelineData } from "./plot-data";

import type { MetricFrame } from "../shared/metric-frames";

const distributionFrame = (
  frameNumber: number,
  bins: [number, number][],
): MetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "distribution",
  frameNumber,
  time: frameNumber * 10,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
});

const scalarFrame = (
  frameNumber: number,
  value: number | null,
): MetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "scalar",
  frameNumber,
  time: frameNumber * 10,
  value,
  frameValue: value,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
  runAggregate: { count: 1, sum: 0, min: 0, max: 0, last: 0 },
  aggregateRuns: "mean",
  aggregateTime: "none",
});

describe("buildMetricTimelineData", () => {
  const scalarFrames = [
    scalarFrame(0, 4),
    scalarFrame(1, null),
    scalarFrame(2, 7),
    scalarFrame(3, 5),
  ];
  // Mean 2, then 4, then 3; the median of the second frame is 1.
  const distributionFrames = [
    distributionFrame(0, [[2, 3]]),
    distributionFrame(1, [
      [1, 2],
      [7, 2],
    ]),
    distributionFrame(2, [[3, 1]]),
  ];

  it("draws a scalar metric as one line over time", () => {
    expect(
      buildMetricTimelineData(
        scalarFrames,
        "scalar",
        false,
        "mean",
        "heatmap",
        "value",
      ),
    ).toEqual([
      [0, 10, 20, 30],
      [4, null, 7, 5],
    ]);
  });

  it("traces the highest value to date", () => {
    expect(
      buildMetricTimelineData(
        scalarFrames,
        "scalar",
        false,
        "mean",
        "heatmap",
        "maxToDate",
      )[1],
    ).toEqual([4, 4, 7, 7]);
  });

  it("draws a distribution with its runs aggregated as one line", () => {
    expect(
      buildMetricTimelineData(
        distributionFrames,
        "distribution",
        true,
        "mean",
        "heatmap",
        "value",
      ),
    ).toEqual([
      [0, 10, 20],
      [2, 4, 3],
    ]);
    expect(
      buildMetricTimelineData(
        distributionFrames,
        "distribution",
        true,
        "median",
        "heatmap",
        "minToDate",
      )[1],
    ).toEqual([2, 1, 1]);
  });

  it("gives the heatmap the times and no values", () => {
    expect(
      buildMetricTimelineData(
        distributionFrames,
        "distribution",
        false,
        "mean",
        "heatmap",
        "value",
      ),
    ).toEqual([
      [0, 10, 20],
      [null, null, null],
    ]);
  });

  it("draws the percentile lines in the order of their series", () => {
    expect(
      buildMetricTimelineData(
        distributionFrames,
        "distribution",
        false,
        "mean",
        "bands",
        "value",
      ),
    ).toEqual([
      [0, 10, 20],
      [2, 1, 3],
      [2, 1, 3],
      [2, 1, 3],
      [2, 4, 3],
      [2, 7, 3],
      [2, 7, 3],
    ]);
  });

  it("leaves out the frames of the other output type", () => {
    const mixed = [...scalarFrames, ...distributionFrames];
    expect(
      buildMetricTimelineData(
        mixed,
        "scalar",
        false,
        "mean",
        "heatmap",
        "value",
      )[0],
    ).toEqual([0, 10, 20, 30]);
    expect(
      buildMetricTimelineData(
        mixed,
        "distribution",
        true,
        "mean",
        "heatmap",
        "value",
      )[0],
    ).toEqual([0, 10, 20]);
  });
});

describe("buildDistributionBarData", () => {
  it("puts the bin values on x and their frequencies on y", () => {
    expect(
      buildDistributionBarData([
        [1, 3],
        [4, 0.5],
      ]),
    ).toEqual([
      [1, 4],
      [3, 0.5],
    ]);
  });
});
