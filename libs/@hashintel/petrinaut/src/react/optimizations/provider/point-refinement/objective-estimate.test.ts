import { describe, expect, it } from "vitest";

import { distributionFrame } from "../../fake-detached-objective-runs.fixtures";
import { estimateObjective, shouldStopRefining } from "./objective-estimate";

const metricId = "metric";

describe("estimateObjective", () => {
  it("reads the mean and its standard error off the last frame with samples", () => {
    const estimate = estimateObjective(
      [
        distributionFrame(metricId, 1, [[0.9, 4]]),
        distributionFrame(metricId, 2, [
          [0.1, 2],
          [0.3, 2],
        ]),
        distributionFrame(metricId, 3, []),
      ],
      metricId,
    );

    // Values 0.1, 0.1, 0.3, 0.3: mean 0.2, sample variance 0.04/3.
    expect(estimate).toEqual({
      runs: 4,
      mean: expect.closeTo(0.2, 12) as number,
      standardError: expect.closeTo(Math.sqrt(0.04 / 3 / 4), 12) as number,
    });
  });

  it("leaves the error unbounded with one run, and estimates nothing without a distribution", () => {
    expect(
      estimateObjective([distributionFrame(metricId, 1, [[0.5, 1]])], metricId),
    ).toEqual({ runs: 1, mean: 0.5, standardError: Number.POSITIVE_INFINITY });
    expect(estimateObjective([], metricId)).toBeNull();
    expect(
      estimateObjective([distributionFrame("other", 1, [[0.5, 3]])], metricId),
    ).toBeNull();
  });
});

describe("shouldStopRefining", () => {
  it("stops a maximized point whose mean plus 2.5 errors falls short of the best, and not at the boundary", () => {
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: 10,
        mean: 7,
        standardError: 1,
      }),
    ).toBe(true);
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: 10,
        mean: 7.5,
        standardError: 1,
      }),
    ).toBe(false);
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: 10,
        mean: 7.4,
        standardError: 1,
      }),
    ).toBe(true);
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: 10,
        mean: 12,
        standardError: 1,
      }),
    ).toBe(false);
  });

  it("stops a minimized point whose mean minus 2.5 errors exceeds the best", () => {
    expect(
      shouldStopRefining({
        direction: "minimize",
        best: 0.1,
        mean: 0.4,
        standardError: 0.1,
      }),
    ).toBe(true);
    expect(
      shouldStopRefining({
        direction: "minimize",
        best: 0.1,
        mean: 0.35,
        standardError: 0.1,
      }),
    ).toBe(false);
    expect(
      shouldStopRefining({
        direction: "minimize",
        best: 0.1,
        mean: 0.05,
        standardError: 0.1,
      }),
    ).toBe(false);
  });

  it("never stops without a best, or while a single run leaves the error unbounded", () => {
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: null,
        mean: 0,
        standardError: 0,
      }),
    ).toBe(false);
    expect(
      shouldStopRefining({
        direction: "maximize",
        best: 10,
        mean: 0,
        standardError: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });
});
