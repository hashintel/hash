import { describe, expect, it } from "vitest";

import {
  binValueSummary,
  MAX_RESOLVED_BIN_VALUES,
  summarizeBinValues,
} from "./bin-value-summary";

import type { MetricFrame } from "../../shared/metric-frames";

const distributionFrame = (
  frameNumber: number,
  bins: [number, number][],
): MetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "distribution",
  frameNumber,
  time: frameNumber,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
});

const scalarFrame = (frameNumber: number): MetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "scalar",
  frameNumber,
  time: frameNumber,
  value: 99,
  frameValue: 99,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
  runAggregate: { count: 1, sum: 99, min: 99, max: 99, last: 99 },
  aggregateRuns: "mean",
  aggregateTime: "none",
});

describe("summarizeBinValues", () => {
  it("spans every frame's bins and sorts the distinct values", () => {
    const summary = summarizeBinValues([
      {
        bins: [
          [5, 1],
          [2, 1],
        ],
      },
      { bins: [[9, 1]] },
      { bins: [[2, 3]] },
    ]);
    expect(summary).toEqual({ min: 2, max: 9, distinctValues: [2, 5, 9] });
  });

  it("is null without bins", () => {
    expect(summarizeBinValues([{ bins: [] }])).toBeNull();
    expect(summarizeBinValues([])).toBeNull();
  });

  it("collects one distinct value past the resolvable count", () => {
    const bins = Array.from(
      { length: MAX_RESOLVED_BIN_VALUES * 2 },
      (_, index) => [index, 1] as [number, number],
    );
    const summary = summarizeBinValues([{ bins }])!;
    expect(summary.distinctValues).toHaveLength(MAX_RESOLVED_BIN_VALUES + 1);
    expect(summary.max).toBe(MAX_RESOLVED_BIN_VALUES * 2 - 1);
  });
});

describe("binValueSummary", () => {
  it("reads distribution frames only and reuses the result per array", () => {
    const frames = [scalarFrame(0), distributionFrame(1, [[3, 1]])];
    const summary = binValueSummary(frames);
    expect(summary).toEqual({ min: 3, max: 3, distinctValues: [3] });
    expect(binValueSummary(frames)).toBe(summary);
    expect(binValueSummary([...frames])).not.toBe(summary);
  });

  it("caches the absence of bins too", () => {
    const frames = [scalarFrame(0)];
    expect(binValueSummary(frames)).toBeNull();
    expect(binValueSummary(frames)).toBeNull();
  });
});
