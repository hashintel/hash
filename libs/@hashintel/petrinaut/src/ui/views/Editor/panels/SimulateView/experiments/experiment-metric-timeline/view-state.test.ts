import { describe, expect, it } from "vitest";

import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  deriveMetricViewState,
  selectedFrameFrom,
} from "./view-state";

import type { MetricFrame } from "./shared/metric-frames";

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

const scalarFrame = (frameNumber: number, value: number): MetricFrame => ({
  metricId: "infected",
  label: "Infected",
  outputType: "scalar",
  frameNumber,
  time: frameNumber,
  value,
  frameValue: value,
  timeValue: null,
  runSampleCount: 1,
  timeSampleCount: 1,
  runAggregate: { count: 1, sum: value, min: value, max: value, last: value },
  aggregateRuns: "mean",
  aggregateTime: "none",
});

const pointer = { clientX: 0, clientY: 0 };

describe("deriveMetricViewState", () => {
  const frames = [
    distributionFrame(0, [[1, 2]]),
    distributionFrame(1, [
      [1, 1],
      [3, 1],
    ]),
  ];

  it("charts the frames by default", () => {
    const view = deriveMetricViewState({
      frames,
      outputType: "distribution",
      settings: DEFAULT_METRIC_VIEW_SETTINGS,
      keepsAxesWhileEmpty: false,
    });
    expect(view.displayMode).toBe("chart");
    expect(view.showsBandLegend).toBe(false);
    expect(view.aggregateNumber).toBeNull();
    expect(view.plotData[0]).toEqual([0, 1]);
    expect(view.canPlot).toBe(true);
  });

  it("shows the band legend only for the percentile-lines chart", () => {
    const view = deriveMetricViewState({
      frames,
      outputType: "distribution",
      settings: { ...DEFAULT_METRIC_VIEW_SETTINGS, distributionView: "bands" },
      keepsAxesWhileEmpty: false,
    });
    expect(view.showsBandLegend).toBe(true);
    expect(view.plotData).toHaveLength(7);
  });

  it("collapses an unaggregated distribution over time to one distribution", () => {
    const view = deriveMetricViewState({
      frames,
      outputType: "distribution",
      settings: {
        ...DEFAULT_METRIC_VIEW_SETTINGS,
        aggregateTime: true,
        timeAggregation: "sum",
      },
      keepsAxesWhileEmpty: false,
    });
    expect(view.displayMode).toBe("distribution");
    expect(view.plotData).toEqual([
      [1, 3],
      [3, 1],
    ]);
  });

  it("collapses a scalar-like series over time to one number", () => {
    const view = deriveMetricViewState({
      frames: [scalarFrame(0, 2), scalarFrame(1, 4)],
      outputType: "scalar",
      settings: { ...DEFAULT_METRIC_VIEW_SETTINGS, aggregateTime: true },
      keepsAxesWhileEmpty: true,
    });
    expect(view.displayMode).toBe("number");
    expect(view.aggregateNumber).toBe(3);
    expect(view.canPlot).toBe(false);

    const aggregatedRuns = deriveMetricViewState({
      frames,
      outputType: "distribution",
      settings: {
        ...DEFAULT_METRIC_VIEW_SETTINGS,
        aggregateRuns: true,
        aggregateTime: true,
      },
      keepsAxesWhileEmpty: false,
    });
    expect(aggregatedRuns.displayMode).toBe("number");
  });

  it("keeps a plot mounted without data only with pinned axes", () => {
    const empty = { frames: [], outputType: "scalar" as const };
    expect(
      deriveMetricViewState({
        ...empty,
        settings: DEFAULT_METRIC_VIEW_SETTINGS,
        keepsAxesWhileEmpty: true,
      }).canPlot,
    ).toBe(true);
    expect(
      deriveMetricViewState({
        ...empty,
        settings: DEFAULT_METRIC_VIEW_SETTINGS,
        keepsAxesWhileEmpty: false,
      }).canPlot,
    ).toBe(false);
  });
});

describe("selectedFrameFrom", () => {
  const frames = [scalarFrame(0, 1), scalarFrame(1, 2), scalarFrame(2, 3)];

  it("returns the frame at the remembered index when it is the same frame", () => {
    const selected = selectedFrameFrom(frames, {
      index: 1,
      frameNumber: 1,
      pointer,
    });
    expect(selected).toBe(frames[1]);
  });

  it("finds the frame by number when the index no longer matches", () => {
    const restreamed = [scalarFrame(5, 9), ...frames];
    const selected = selectedFrameFrom(restreamed, {
      index: 1,
      frameNumber: 2,
      pointer,
    });
    expect(selected).toBe(restreamed[3]);
  });

  it("is null until the frame re-arrives", () => {
    expect(
      selectedFrameFrom(frames.slice(0, 1), {
        index: 2,
        frameNumber: 2,
        pointer,
      }),
    ).toBeNull();
  });
});
