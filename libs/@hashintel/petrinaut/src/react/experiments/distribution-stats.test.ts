import { describe, expect, it } from "vitest";

import { distributionStats } from "./distribution-stats";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

const distribution = (
  frameNumber: number,
  bins: readonly (readonly [number, number])[],
): MonteCarloUserDefinedMetricFrame => ({
  metricId: "m",
  label: "M",
  outputType: "distribution",
  frameNumber,
  time: frameNumber,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: bins.reduce((sum, [, frequency]) => sum + frequency, 0),
  timeSampleCount: 0,
});

describe("distributionStats", () => {
  it("reads mean and median off the metric's final distribution frame", () => {
    const stats = distributionStats(
      [
        distribution(0, [[100, 8]]),
        distribution(1, [
          [10, 3],
          [20, 4],
          [50, 1],
        ]),
      ],
      "m",
    );
    expect(stats).toEqual({ runs: 8, mean: 20, median: 20 });
  });

  it("takes the lowest bin at or past half the weight as the median", () => {
    const stats = distributionStats(
      [
        distribution(0, [
          [1, 5],
          [9, 5],
        ]),
      ],
      "m",
    );
    expect(stats?.median).toBe(1);
  });

  it("returns null when the metric never reported a distribution", () => {
    expect(distributionStats([distribution(0, [[1, 4]])], "other")).toBeNull();
    expect(distributionStats([], "m")).toBeNull();
  });
});
