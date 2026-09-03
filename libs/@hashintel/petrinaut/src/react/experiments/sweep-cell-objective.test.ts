import { describe, expect, it } from "vitest";

import { sweepCellObjective } from "./sweep-cell-objective";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

describe("sweepCellObjective", () => {
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
    runSampleCount: 8,
    timeSampleCount: 8,
  });

  it("reads the mean of the metric's final distribution frame", () => {
    const frames = [
      distribution(0, [[100, 8]]),
      distribution(1, [
        [10, 4],
        [20, 4],
      ]),
    ];
    expect(sweepCellObjective(frames, "m")).toBe(15);
  });

  it("returns null when the metric never reported", () => {
    expect(sweepCellObjective([distribution(0, [[1, 8]])], "other")).toBeNull();
  });

  it("scans back past trailing sample-less frames to the last real one", () => {
    const frames = [
      distribution(0, [[100, 8]]),
      distribution(1, [
        [10, 4],
        [20, 4],
      ]),
      distribution(2, []),
      distribution(3, []),
    ];
    expect(sweepCellObjective(frames, "m")).toBe(15);
  });

  it("scans back past a trailing null scalar frame", () => {
    const scalar = (
      frameNumber: number,
      frameValue: number | null,
    ): MonteCarloUserDefinedMetricFrame => ({
      metricId: "m",
      label: "M",
      outputType: "scalar",
      frameNumber,
      time: frameNumber,
      value: frameValue,
      frameValue,
      timeValue: null,
      runSampleCount: frameValue === null ? 0 : 8,
      timeSampleCount: frameValue === null ? 0 : 8,
      runAggregate: {
        count: 1,
        sum: frameValue ?? 0,
        min: frameValue,
        max: frameValue,
        last: frameValue,
      },
      aggregateRuns: "mean",
      aggregateTime: "none",
    });
    expect(sweepCellObjective([scalar(0, 42), scalar(1, null)], "m")).toBe(42);
  });
});
