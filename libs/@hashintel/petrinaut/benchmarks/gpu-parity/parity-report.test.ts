import { describe, expect, it } from "vitest";

import { compareRuns, frameMean, ksStatistic } from "./parity-report";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

type Bins = [value: number, frequency: number][];

const distribution = (
  frameNumber: number,
  bins: Bins,
  metricId = "metric",
): MonteCarloUserDefinedMetricFrame => ({
  metricId,
  label: metricId,
  frameNumber,
  time: frameNumber / 10,
  runSampleCount: bins.reduce((sum, [, frequency]) => sum + frequency, 0),
  outputType: "distribution",
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  timeSampleCount: 0,
});

const scalar = (
  frameNumber: number,
  value: number | null,
): MonteCarloUserDefinedMetricFrame => ({
  metricId: "metric",
  label: "metric",
  frameNumber,
  time: frameNumber / 10,
  runSampleCount: 1,
  outputType: "scalar",
  value,
  frameValue: value,
  timeValue: null,
  timeSampleCount: 0,
  runAggregate: {
    count: 1,
    sum: value ?? 0,
    min: value,
    max: value,
    last: value,
  },
  aggregateRuns: "mean",
  aggregateTime: "none",
});

describe("frameMean", () => {
  it("weights each bin by its frequency", () => {
    expect(
      frameMean(
        distribution(0, [
          [0, 1],
          [10, 3],
        ]),
      ),
    ).toBe(7.5);
  });

  it("is the value of a scalar frame", () => {
    expect(frameMean(scalar(0, 4))).toBe(4);
    expect(frameMean(scalar(0, null))).toBeNull();
  });

  it("is null for a distribution without samples", () => {
    expect(frameMean(distribution(0, []))).toBeNull();
  });
});

describe("ksStatistic", () => {
  it("is 0 for two distributions of the same shape", () => {
    expect(
      ksStatistic(
        distribution(0, [
          [1, 2],
          [2, 2],
        ]),
        // Twice the samples, in another order.
        distribution(0, [
          [2, 4],
          [1, 4],
        ]),
      ),
    ).toBe(0);
  });

  it("is 1 for distributions that do not overlap", () => {
    expect(
      ksStatistic(distribution(0, [[1, 5]]), distribution(0, [[2, 5]])),
    ).toBe(1);
  });

  it("is the largest gap between the cumulative distributions", () => {
    // Cumulative at 1, 2, 3: left 0.5, 0.5, 1; right 0.25, 0.75, 1.
    expect(
      ksStatistic(
        distribution(0, [
          [1, 2],
          [3, 2],
        ]),
        distribution(0, [
          [1, 1],
          [2, 2],
          [3, 1],
        ]),
      ),
    ).toBe(0.25);
  });

  it("is NaN when a frame is a scalar or has no samples", () => {
    const samples = distribution(0, [[1, 1]]);
    expect(ksStatistic(scalar(0, 1), samples)).toBeNaN();
    expect(ksStatistic(samples, distribution(0, []))).toBeNaN();
    expect(ksStatistic(distribution(0, []), distribution(0, []))).toBeNaN();
  });
});

describe("compareRuns", () => {
  const compare = (
    cpu: MonteCarloUserDefinedMetricFrame[],
    gpu: MonteCarloUserDefinedMetricFrame[],
  ) =>
    compareRuns({
      label: "Model · Measure",
      metricId: "metric",
      runCount: 100,
      cpu: { frames: cpu, ms: 1027.6 },
      gpu: { frames: gpu, ms: 158.2 },
    });

  it("reports the label, the run count and whole milliseconds", () => {
    expect(compare([], [])).toMatchObject({
      model: "Model · Measure",
      runCount: 100,
      cpuMs: 1028,
      gpuMs: 158,
    });
  });

  it("averages the relative difference of the frame means and keeps the worst", () => {
    const report = compare(
      [distribution(0, [[10, 1]]), distribution(1, [[20, 1]])],
      [distribution(0, [[11, 1]]), distribution(1, [[21, 1]])],
    );
    // 1 / 10 on frame 0 and 1 / 20 on frame 1.
    expect(report.frames).toBe(2);
    expect(report.maxRelativeDifference).toBeCloseTo(0.1);
    expect(report.meanRelativeDifference).toBeCloseTo(0.075);
  });

  it("divides by 1 when the CPU mean is smaller, so a mean near zero does not blow up", () => {
    const report = compare(
      [distribution(0, [[0.1, 1]])],
      [distribution(0, [[0.3, 1]])],
    );
    expect(report.maxRelativeDifference).toBeCloseTo(0.2);
  });

  it("compares only the frames both backends produced, whatever their order", () => {
    const report = compare(
      [
        distribution(2, [[4, 1]]),
        distribution(0, [[1, 1]]),
        distribution(1, [[9, 1]]),
      ],
      [distribution(0, [[1, 1]]), distribution(2, [[4, 1]])],
    );
    expect(report.frames).toBe(2);
    expect(report.maxRelativeDifference).toBe(0);
  });

  it("ignores the frames of other metrics", () => {
    const report = compare(
      [distribution(0, [[1, 1]]), distribution(0, [[50, 1]], "other")],
      [distribution(0, [[1, 1]]), distribution(0, [[90, 1]], "other")],
    );
    expect(report.frames).toBe(1);
    expect(report.maxRelativeDifference).toBe(0);
  });

  it("leaves a frame without samples out of the means but counts it as common", () => {
    const report = compare(
      [distribution(0, [[10, 1]]), distribution(1, [])],
      [distribution(0, [[10, 1]]), distribution(1, [[3, 1]])],
    );
    expect(report.frames).toBe(2);
    expect(report.meanRelativeDifference).toBe(0);
  });

  it("takes the KS statistic from the last frame both backends sampled", () => {
    const report = compare(
      [
        distribution(0, [[1, 1]]),
        distribution(1, [[1, 1]]),
        distribution(2, []),
      ],
      [
        distribution(0, [[1, 1]]),
        distribution(1, [[2, 1]]),
        distribution(2, []),
        // The CPU has no frame 3, so this one is not compared.
        distribution(3, [[1, 1]]),
      ],
    );
    expect(report.frames).toBe(3);
    expect(report.finalKs).toBe(1);
  });

  it("has no mean difference and no KS statistic without a common frame", () => {
    const report = compare(
      [distribution(0, [[1, 1]])],
      [distribution(1, [[1, 1]])],
    );
    expect(report).toMatchObject({ frames: 0, maxRelativeDifference: 0 });
    expect(report.meanRelativeDifference).toBeNaN();
    expect(report.finalKs).toBeNaN();
  });
});
