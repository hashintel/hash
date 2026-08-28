import { describe, expect, it } from "vitest";

import {
  axisPositionFor,
  axisValueAt,
  buildParameterAxis,
  fullSweepSelection,
  getNextRunTarget,
  mergeMetricFramesAcrossCells,
  normalizeSweepSelection,
  SWEEP_AXIS_STEPS,
  sweepRunFraction,
} from "./parameter-grid";

import type { ExperimentParameterAxis } from "./parameter-grid";
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
    runAggregate: { count: 0, sum: 0, min: null, max: null, last: null },
    aggregateRuns: "mean",
    aggregateTime: "none",
    ...overrides,
  };
}

describe("buildParameterAxis", () => {
  it("quantizes a real interval into SWEEP_AXIS_STEPS steps", () => {
    const outcome = buildParameterAxis(
      { identifier: "beta", type: "real" },
      { min: 0, max: 1 },
    );
    expect(outcome).toEqual({
      ok: true,
      axis: {
        identifier: "beta",
        min: 0,
        max: 1,
        stepCount: SWEEP_AXIS_STEPS,
        integer: false,
      },
    });
  });

  it("gives a narrow integer interval one step per integer", () => {
    const outcome = buildParameterAxis(
      { identifier: "count", type: "integer" },
      { min: 3, max: 9 },
    );
    expect(outcome).toEqual({
      ok: true,
      axis: {
        identifier: "count",
        min: 3,
        max: 9,
        stepCount: 6,
        integer: true,
      },
    });
  });

  it("caps a wide integer interval at SWEEP_AXIS_STEPS", () => {
    const outcome = buildParameterAxis(
      { identifier: "count", type: "integer" },
      { min: 0, max: 1000 },
    );
    expect(outcome.ok && outcome.axis.stepCount).toBe(SWEEP_AXIS_STEPS);
  });

  it("rejects boolean parameters", () => {
    expect(
      buildParameterAxis(
        { identifier: "flag", type: "boolean" },
        { min: 0, max: 1 },
      ).ok,
    ).toBe(false);
  });

  it("rejects ratio intervals outside [0, 1]", () => {
    expect(
      buildParameterAxis(
        { identifier: "share", type: "ratio" },
        { min: -0.1, max: 0.5 },
      ).ok,
    ).toBe(false);
  });

  it("rejects max <= min", () => {
    expect(
      buildParameterAxis(
        { identifier: "beta", type: "real" },
        { min: 1, max: 1 },
      ).ok,
    ).toBe(false);
  });
});

describe("axisValueAt / axisPositionFor", () => {
  const beta: ExperimentParameterAxis = {
    identifier: "beta",
    min: 0,
    max: 1,
    stepCount: 50,
    integer: false,
  };

  it("maps position endpoints to the interval endpoints", () => {
    expect(axisValueAt(beta, 0)).toBe(0);
    expect(axisValueAt(beta, 50)).toBe(1);
    expect(axisValueAt(beta, 25)).toBe(0.5);
  });

  it("keeps generated values free of float artifacts", () => {
    const axis: ExperimentParameterAxis = {
      identifier: "x",
      min: 0,
      max: 0.7,
      stepCount: 50,
      integer: false,
    };
    // 0.7 * 15 / 50 in raw float arithmetic carries an artifact tail.
    expect(String(axisValueAt(axis, 15)).length).toBeLessThanOrEqual(6);
  });

  it("rounds integer axis values to integers", () => {
    const axis: ExperimentParameterAxis = {
      identifier: "count",
      min: 0,
      max: 1000,
      stepCount: 50,
      integer: true,
    };
    expect(axisValueAt(axis, 7)).toBe(140);
  });

  it("round-trips values to their nearest position", () => {
    expect(axisPositionFor(beta, 0.5)).toBe(25);
    expect(axisPositionFor(beta, 0.501)).toBe(25);
    expect(axisPositionFor(beta, 2)).toBe(50);
    expect(axisPositionFor(beta, -1)).toBe(0);
  });
});

describe("selections and regions", () => {
  const axes: ExperimentParameterAxis[] = [
    { identifier: "x", min: 0, max: 1, stepCount: 4, integer: false },
    { identifier: "y", min: 0, max: 1, stepCount: 2, integer: false },
  ];

  it("defaults to the whole interval per axis", () => {
    expect(fullSweepSelection(axes)).toEqual({
      x: { from: 0, to: 4 },
      y: { from: 0, to: 2 },
    });
  });

  it("normalizes reversed and out-of-bounds ranges", () => {
    expect(
      normalizeSweepSelection(axes, {
        x: { from: 9, to: -3 },
        y: { from: 1, to: 1 },
      }),
    ).toEqual({ x: { from: 0, to: 4 }, y: { from: 1, to: 1 } });
  });
});

describe("sweepRunFraction", () => {
  it("is prefix-stable: a run's draw never depends on how many runs exist", () => {
    const first = Array.from({ length: 8 }, (_, index) =>
      sweepRunFraction(index, 0),
    );
    const extended = Array.from({ length: 25 }, (_, index) =>
      sweepRunFraction(index, 0),
    );
    expect(extended.slice(0, 8)).toEqual(first);
  });

  it("spreads early runs across the unit interval", () => {
    const fractions = Array.from({ length: 8 }, (_, index) =>
      sweepRunFraction(index, 0),
    );
    expect(Math.min(...fractions)).toBeLessThan(0.2);
    expect(Math.max(...fractions)).toBeGreaterThan(0.8);
  });

  it("draws different axes from different sequences", () => {
    const xDraws = Array.from({ length: 6 }, (_, index) =>
      sweepRunFraction(index, 0),
    );
    const yDraws = Array.from({ length: 6 }, (_, index) =>
      sweepRunFraction(index, 1),
    );
    expect(xDraws).not.toEqual(yDraws);
  });
});

describe("getNextRunTarget", () => {
  it("climbs the ladder from zero", () => {
    expect(getNextRunTarget(0, 1000)).toBe(8);
    expect(getNextRunTarget(8, 1000)).toBe(25);
    expect(getNextRunTarget(25, 1000)).toBe(100);
    expect(getNextRunTarget(100, 1000)).toBe(500);
    expect(getNextRunTarget(500, 1000)).toBe(1000);
  });

  it("clamps the target to the requested run count", () => {
    expect(getNextRunTarget(1, 6)).toBe(6);
    expect(getNextRunTarget(8, 30)).toBe(25);
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

  it("merges scalar frames exactly through the run-aggregate monoid", () => {
    const merged = mergeMetricFramesAcrossCells([
      [
        makeScalarFrame({
          value: 10,
          frameValue: 10,
          runSampleCount: 1,
          runAggregate: { count: 1, sum: 10, min: 10, max: 10, last: 10 },
        }),
      ],
      [
        makeScalarFrame({
          value: 40,
          frameValue: 40,
          runSampleCount: 3,
          runAggregate: { count: 3, sum: 120, min: 30, max: 50, last: 50 },
        }),
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      value: 32.5,
      frameValue: 32.5,
      runSampleCount: 4,
      runAggregate: { count: 4, sum: 130, min: 10, max: 50, last: 50 },
    });
  });

  it("returns a copy for a single cell", () => {
    const frames = [makeDistributionFrame()];
    const merged = mergeMetricFramesAcrossCells([frames]);

    expect(merged).toEqual(frames);
    expect(merged).not.toBe(frames);
  });
});
