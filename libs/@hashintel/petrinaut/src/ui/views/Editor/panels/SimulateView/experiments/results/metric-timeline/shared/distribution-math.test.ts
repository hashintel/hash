import { describe, expect, it } from "vitest";

import {
  aggregateDistributionBins,
  aggregateDistributionOverTime,
  applyTimeTrace,
  percentileFromBins,
  reduceOverTime,
} from "./distribution-math";

import type { DistributionMetricFrame } from "./metric-frames";

const frameWith = (bins: [number, number][]): DistributionMetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "distribution",
  frameNumber: 0,
  time: 0,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
});

describe("aggregateDistributionBins", () => {
  // Ten runs: one at 1, four at 2, four at 5, one at 9.
  const bins: [number, number][] = [
    [1, 1],
    [2, 4],
    [5, 4],
    [9, 1],
  ];

  it.each([
    ["mean", 3.8],
    ["median", 2],
    ["min", 1],
    ["max", 9],
    ["p10", 1],
    ["p25", 2],
    ["p75", 5],
    ["p90", 5],
  ] as const)("reduces a frame's runs to their %s", (aggregation, expected) => {
    expect(aggregateDistributionBins(bins, aggregation)).toBe(expected);
  });

  it.each([
    "mean",
    "median",
    "min",
    "max",
    "p10",
    "p25",
    "p75",
    "p90",
  ] as const)("has no %s without bins", (aggregation) => {
    expect(aggregateDistributionBins([], aggregation)).toBeNull();
  });
});

describe("percentileFromBins", () => {
  it("is the first value whose cumulative count reaches the fraction", () => {
    const bins: [number, number][] = [
      [10, 1],
      [20, 1],
      [30, 2],
    ];
    expect(percentileFromBins(bins, 0.25)).toBe(10);
    expect(percentileFromBins(bins, 0.26)).toBe(20);
    expect(percentileFromBins(bins, 1)).toBe(30);
  });

  it("is null when no bin holds a sample", () => {
    expect(percentileFromBins([[3, 0]], 0.5)).toBeNull();
  });
});

describe("applyTimeTrace", () => {
  const values = [null, 3, 5, null, 1];

  it("returns the values themselves, in a new array", () => {
    const traced = applyTimeTrace(values, "value");
    expect(traced).toEqual(values);
    expect(traced).not.toBe(values);
  });

  it("carries the lowest value to date over a gap", () => {
    expect(applyTimeTrace(values, "minToDate")).toEqual([null, 3, 3, 3, 1]);
  });

  it("carries the highest value to date over a gap", () => {
    expect(applyTimeTrace(values, "maxToDate")).toEqual([null, 3, 5, 5, 5]);
  });
});

describe("reduceOverTime", () => {
  it.each([
    ["mean", 4],
    ["min", 2],
    ["max", 6],
    ["sum", 12],
  ] as const)(
    "reduces the values that exist to their %s",
    (aggregation, expected) => {
      expect(reduceOverTime([2, null, 6, 4], aggregation)).toBe(expected);
    },
  );

  it("is null without a value", () => {
    expect(reduceOverTime([], "sum")).toBeNull();
    expect(reduceOverTime([null, null], "mean")).toBeNull();
  });
});

describe("aggregateDistributionOverTime", () => {
  // The value 1 is absent from the first frame.
  const frames = [
    frameWith([[3, 4]]),
    frameWith([
      [1, 6],
      [3, 2],
    ]),
  ];

  it.each([
    [
      "sum",
      [
        [1, 6],
        [3, 6],
      ],
    ],
    [
      "mean",
      [
        [1, 3],
        [3, 3],
      ],
    ],
    [
      "min",
      [
        [1, 0],
        [3, 2],
      ],
    ],
    [
      "max",
      [
        [1, 6],
        [3, 4],
      ],
    ],
  ] as const)(
    "reduces each value's frequency over the frames to its %s, values ascending",
    (aggregation, expected) => {
      expect(aggregateDistributionOverTime(frames, aggregation)).toEqual(
        expected,
      );
    },
  );

  it("is empty without frames", () => {
    expect(aggregateDistributionOverTime([], "mean")).toEqual([]);
  });
});
