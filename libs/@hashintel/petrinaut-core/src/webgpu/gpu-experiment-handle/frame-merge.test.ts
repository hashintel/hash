import { describe, expect, it } from "vitest";

import { createEmptyMetricsState } from "../../simulation/monte-carlo/runtime/experiment-stores";
import { createFrameMerger } from "./frame-merge";

import type { MonteCarloUserDefinedMetricFrame } from "../../simulation/monte-carlo/metrics";

const frame = (
  metricId: string,
  frameNumber: number,
  value: number,
): MonteCarloUserDefinedMetricFrame => ({
  metricId,
  label: metricId,
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

const summarize = (frames: readonly MonteCarloUserDefinedMetricFrame[]) =>
  frames.map(({ metricId, frameNumber, value }) => [
    metricId,
    frameNumber,
    value,
  ]);

describe("createFrameMerger", () => {
  it("appends while frame numbers only rise", () => {
    const merger = createFrameMerger();
    let state = createEmptyMetricsState();
    state = merger.ingest(state, [frame("a", 1, 10), frame("a", 2, 11)]);
    state = merger.ingest(state, [frame("a", 3, 12)]);

    expect(summarize(state.frames)).toEqual([
      ["a", 1, 10],
      ["a", 2, 11],
      ["a", 3, 12],
    ]);
    expect(state.latestByMetricId.a?.value).toBe(12);
  });

  it("switches to replacing by key once a frame is re-delivered", () => {
    const merger = createFrameMerger();
    let state = createEmptyMetricsState();
    state = merger.ingest(state, [
      frame("a", 1, 10),
      frame("b", 1, 20),
      frame("a", 2, 11),
      frame("b", 2, 21),
    ]);
    // A second tile restarts the time axis with cumulative values.
    state = merger.ingest(state, [frame("a", 1, 30), frame("b", 1, 40)]);
    state = merger.ingest(state, [frame("a", 2, 31), frame("b", 2, 41)]);

    expect(summarize(state.frames)).toEqual([
      ["a", 1, 30],
      ["b", 1, 40],
      ["a", 2, 31],
      ["b", 2, 41],
    ]);
    expect(state.latestByMetricId.a?.value).toBe(31);
    expect(state.latestByMetricId.b?.value).toBe(41);
  });

  it("keeps frames the store already held, such as the host-built frame 0", () => {
    const merger = createFrameMerger();
    let state = createEmptyMetricsState();
    state = merger.ingest(state, [frame("a", 0, 5)]);
    state = merger.ingest(state, [frame("a", 1, 10)]);
    state = merger.ingest(state, [frame("a", 1, 12)]);

    expect(summarize(state.frames)).toEqual([
      ["a", 0, 5],
      ["a", 1, 12],
    ]);
  });
});
