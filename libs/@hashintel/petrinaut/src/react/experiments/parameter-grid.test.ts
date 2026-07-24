import { describe, expect, it } from "vitest";

import {
  buildParameterGridCombinations,
  buildParameterRangeValues,
  countGridCombinations,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  pickNextRefinementCell,
} from "./parameter-grid";

import type {
  MonteCarloUserDefinedDistributionMetricFrame,
  MonteCarloUserDefinedScalarMetricFrame,
} from "@hashintel/petrinaut-core";

function makeDistributionFrame(
  overrides: Partial<MonteCarloUserDefinedDistributionMetricFrame> = {},
): MonteCarloUserDefinedDistributionMetricFrame {
  return {
    metricId: "metric",
    label: "Metric",
    outputType: "distribution",
    frameNumber: 0,
    time: 0,
    bins: [],
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount: 0,
    timeSampleCount: 0,
    ...overrides,
  };
}

function makeScalarFrame(
  overrides: Partial<MonteCarloUserDefinedScalarMetricFrame> = {},
): MonteCarloUserDefinedScalarMetricFrame {
  return {
    metricId: "metric",
    label: "Metric",
    outputType: "scalar",
    frameNumber: 0,
    time: 0,
    value: null,
    frameValue: null,
    timeValue: null,
    runSampleCount: 0,
    timeSampleCount: 0,
    ...overrides,
  };
}

describe("buildParameterRangeValues", () => {
  it("expands an inclusive range into evenly spaced values", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "x", type: "real" },
      { mode: "range", min: 0, max: 9, valueCount: 10 },
    );

    expect(outcome).toEqual({
      ok: true,
      values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
  });

  it("keeps fractional steps free of float artifacts", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "x", type: "real" },
      { mode: "range", min: 0.1, max: 0.5, valueCount: 5 },
    );

    expect(outcome).toEqual({
      ok: true,
      values: [0.1, 0.2, 0.3, 0.4, 0.5],
    });
  });

  it("always includes max as the final value", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "x", type: "real" },
      { mode: "range", min: 0, max: 1, valueCount: 3 },
    );

    expect(outcome).toEqual({ ok: true, values: [0, 0.5, 1] });
  });

  it("produces a single value when valueCount is 1", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "x", type: "real" },
      { mode: "range", min: 2.5, max: 2.5, valueCount: 1 },
    );

    expect(outcome).toEqual({ ok: true, values: [2.5] });
  });

  it("rounds integer parameter values", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "n", type: "integer" },
      { mode: "range", min: 0, max: 10, valueCount: 3 },
    );

    expect(outcome).toEqual({ ok: true, values: [0, 5, 10] });
  });

  it("rejects integer ranges that round onto duplicate values", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "n", type: "integer" },
      { mode: "range", min: 0, max: 2, valueCount: 5 },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toContain("duplicate integer values");
    }
  });

  it("rejects boolean parameters", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "flag", type: "boolean" },
      { mode: "range", min: 0, max: 1, valueCount: 2 },
    );

    expect(outcome.ok).toBe(false);
  });

  it("rejects ratio ranges outside [0, 1]", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "p", type: "ratio" },
      { mode: "range", min: 0.5, max: 1.5, valueCount: 3 },
    );

    expect(outcome.ok).toBe(false);
  });

  it("rejects max <= min when more than one value is requested", () => {
    const outcome = buildParameterRangeValues(
      { identifier: "x", type: "real" },
      { mode: "range", min: 5, max: 5, valueCount: 2 },
    );

    expect(outcome.ok).toBe(false);
  });

  it("rejects non-integer or non-positive value counts", () => {
    for (const valueCount of [0, -1, 2.5, Number.NaN]) {
      const outcome = buildParameterRangeValues(
        { identifier: "x", type: "real" },
        { mode: "range", min: 0, max: 1, valueCount },
      );

      expect(outcome.ok).toBe(false);
    }
  });
});

describe("buildParameterGridCombinations", () => {
  it("returns a single empty combination without axes", () => {
    expect(buildParameterGridCombinations([])).toEqual([{}]);
    expect(countGridCombinations([])).toBe(1);
  });

  it("builds the row-major cartesian product of the axes", () => {
    const combinations = buildParameterGridCombinations([
      { identifier: "a", values: [1, 2] },
      { identifier: "b", values: [10, 20, 30] },
    ]);

    expect(combinations).toEqual([
      { a: 1, b: 10 },
      { a: 1, b: 20 },
      { a: 1, b: 30 },
      { a: 2, b: 10 },
      { a: 2, b: 20 },
      { a: 2, b: 30 },
    ]);
    expect(
      countGridCombinations([
        { identifier: "a", values: [1, 2] },
        { identifier: "b", values: [10, 20, 30] },
      ]),
    ).toBe(6);
  });
});

describe("getNextRunTarget", () => {
  it("climbs the ladder from zero", () => {
    expect(getNextRunTarget(0, 1000)).toBe(1);
    expect(getNextRunTarget(1, 1000)).toBe(10);
    expect(getNextRunTarget(10, 1000)).toBe(50);
    expect(getNextRunTarget(50, 1000)).toBe(100);
    expect(getNextRunTarget(100, 1000)).toBe(500);
    expect(getNextRunTarget(500, 1000)).toBe(1000);
  });

  it("clamps the target to the requested run count", () => {
    expect(getNextRunTarget(1, 30)).toBe(10);
    expect(getNextRunTarget(10, 30)).toBe(30);
    expect(getNextRunTarget(50, 60)).toBe(60);
  });

  it("returns null once the combination is saturated", () => {
    expect(getNextRunTarget(30, 30)).toBeNull();
    expect(getNextRunTarget(1000, 1000)).toBeNull();
    expect(getNextRunTarget(1500, 1000)).toBeNull();
  });

  it("extends beyond the explicit ladder with ×5/×2 steps", () => {
    expect(getNextRunTarget(1000, 100_000)).toBe(5000);
    expect(getNextRunTarget(5000, 100_000)).toBe(10_000);
    expect(getNextRunTarget(10_000, 100_000)).toBe(50_000);
  });
});

describe("pickNextRefinementCell", () => {
  it("returns null without candidates", () => {
    expect(pickNextRefinementCell([], () => 0)).toBeNull();
  });

  it("picks among the candidates with the fewest completed runs", () => {
    const candidates = [
      { cellIndex: 0, completedRuns: 10 },
      { cellIndex: 1, completedRuns: 1 },
      { cellIndex: 2, completedRuns: 1 },
      { cellIndex: 3, completedRuns: 50 },
    ];

    expect(pickNextRefinementCell(candidates, () => 0)).toBe(1);
    expect(pickNextRefinementCell(candidates, () => 0.99)).toBe(2);
  });
});

describe("mergeMetricFramesAcrossCells", () => {
  it("sums distribution bins for matching metric frames", () => {
    const merged = mergeMetricFramesAcrossCells([
      [
        makeDistributionFrame({
          bins: [
            [0, 3],
            [1, 2],
          ],
          runSampleCount: 5,
          timeSampleCount: 5,
        }),
      ],
      [
        makeDistributionFrame({
          bins: [
            [1, 4],
            [2, 1],
          ],
          runSampleCount: 5,
          timeSampleCount: 5,
        }),
      ],
    ]);

    expect(merged).toEqual([
      makeDistributionFrame({
        bins: [
          [0, 3],
          [1, 6],
          [2, 1],
        ],
        runSampleCount: 10,
        timeSampleCount: 10,
      }),
    ]);
  });

  it("keeps frames from cells at different stream positions", () => {
    const merged = mergeMetricFramesAcrossCells([
      [
        makeDistributionFrame({
          frameNumber: 0,
          bins: [[1, 1]],
          runSampleCount: 1,
        }),
        makeDistributionFrame({
          frameNumber: 1,
          time: 0.1,
          bins: [[2, 1]],
          runSampleCount: 1,
        }),
      ],
      [
        makeDistributionFrame({
          frameNumber: 0,
          bins: [[3, 1]],
          runSampleCount: 1,
        }),
      ],
    ]);

    expect(merged.map((frame) => frame.frameNumber)).toEqual([0, 1]);
    expect(merged[0]).toMatchObject({
      bins: [
        [1, 1],
        [3, 1],
      ],
      runSampleCount: 2,
    });
    expect(merged[1]).toMatchObject({ bins: [[2, 1]], runSampleCount: 1 });
  });

  it("groups by metric in first-seen order and sorts frames by frame number", () => {
    const merged = mergeMetricFramesAcrossCells([
      [
        makeDistributionFrame({ metricId: "a", frameNumber: 1 }),
        makeDistributionFrame({ metricId: "b", frameNumber: 0 }),
      ],
      [makeDistributionFrame({ metricId: "a", frameNumber: 0 })],
    ]);

    expect(merged.map((frame) => [frame.metricId, frame.frameNumber])).toEqual([
      ["a", 0],
      ["a", 1],
      ["b", 0],
    ]);
  });

  it("merges scalar frames with a run-sample-weighted mean", () => {
    const merged = mergeMetricFramesAcrossCells([
      [makeScalarFrame({ value: 10, frameValue: 10, runSampleCount: 1 })],
      [makeScalarFrame({ value: 40, frameValue: 40, runSampleCount: 3 })],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      value: 32.5,
      frameValue: 32.5,
      runSampleCount: 4,
    });
  });

  it("returns a copy for a single cell", () => {
    const frames = [makeDistributionFrame()];
    const merged = mergeMetricFramesAcrossCells([frames]);

    expect(merged).toEqual(frames);
    expect(merged).not.toBe(frames);
  });
});
