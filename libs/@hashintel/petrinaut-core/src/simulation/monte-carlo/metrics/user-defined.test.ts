import { describe, expect, it } from "vitest";

import { createMonteCarloUserDefinedMetric } from "./user-defined";

import type { SimulationFrameReader } from "../../api";
import type {
  MonteCarloFrameMetricContext,
  MonteCarloMetricRunStatus,
  MonteCarloUserDefinedMetricConfig,
} from "./types";

/** A frame context over `runs`: run index to the value the metric reads, every run in `status`. */
const frameContext = (
  frameNumber: number,
  runs: Readonly<Record<number, number>>,
  status: MonteCarloMetricRunStatus = "running",
): MonteCarloFrameMetricContext => ({
  frameNumber,
  time: frameNumber,
  runCount: Object.keys(runs).length,
  activeRunCount: status === "running" ? Object.keys(runs).length : 0,
  completedRunCount: status === "complete" ? Object.keys(runs).length : 0,
  erroredRunCount: 0,
  placeIds: [],
  placeNames: [],
  forEachActiveRunPlaceCounts: () => {},
  forEachRunFrame: (visitor) => {
    for (const [runIndex, value] of Object.entries(runs)) {
      visitor({
        runIndex: Number(runIndex),
        status,
        // The measure below reads the value straight off this stub.
        frame: { value } as unknown as SimulationFrameReader,
      });
    }
  },
});

const metric = (config: Partial<MonteCarloUserDefinedMetricConfig> = {}) =>
  createMonteCarloUserDefinedMetric({
    id: "indicator",
    measure: ({ frame }) => (frame as unknown as { value: number }).value,
    sampleRuns: "all",
    ...config,
  });

describe("createMonteCarloUserDefinedMetric getRunValues", () => {
  it("reports each run's latest sample without a time aggregation", () => {
    const indicator = metric();
    indicator.observeFrame(frameContext(0, { 0: 1, 1: 1 }));
    indicator.observeFrame(frameContext(1, { 0: 0, 1: 1 }));
    indicator.observeFrame(frameContext(2, { 0: 1, 1: 1 }));
    expect([...indicator.getRunValues()]).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("reports each run's minimum over its frames with aggregateTime min: a run that dipped once reads 0", () => {
    const indicator = metric({ aggregateTime: "min" });
    indicator.observeFrame(frameContext(0, { 0: 1, 1: 1 }));
    indicator.observeFrame(frameContext(1, { 0: 0, 1: 1 }));
    indicator.observeFrame(frameContext(2, { 0: 1, 1: 1 }));
    expect([...indicator.getRunValues()]).toEqual([
      [0, 0],
      [1, 1],
    ]);
    // The frame value stays the mean over runs of the per-frame samples,
    // folded over time by the same aggregation.
    expect(indicator.getLatestFrame()).toMatchObject({
      outputType: "scalar",
      frameValue: 1,
      timeValue: 0.5,
    });
  });

  it("aggregates each run over time for distribution output too", () => {
    const indicator = metric({
      aggregateTime: "max",
      runOutput: { type: "distribution", binning: "exact" },
    });
    indicator.observeFrame(frameContext(0, { 0: 2, 1: 5 }));
    indicator.observeFrame(frameContext(1, { 0: 7, 1: 1 }));
    expect([...indicator.getRunValues()]).toEqual([
      [0, 7],
      [1, 5],
    ]);
    expect(indicator.getLatestFrame()).toMatchObject({
      outputType: "distribution",
      bins: [
        [5, 1],
        [7, 1],
      ],
    });
  });

  it("bins each finished run's min on the last frame with sampleRuns all: [[0, failed], [1, passed]]", () => {
    // A state constraint's indicator: 1 where the condition held, min over
    // the run's frames, every run sampled so finished runs stay in the bins.
    const indicator = metric({
      aggregateTime: "min",
      runOutput: { type: "distribution" },
    });
    indicator.observeFrame(frameContext(0, { 0: 1, 1: 1, 2: 1, 3: 1 }));
    indicator.observeFrame(frameContext(1, { 0: 0, 1: 1, 2: 1, 3: 1 }));
    indicator.observeFrame(
      frameContext(2, { 0: 1, 1: 1, 2: 1, 3: 1 }, "complete"),
    );

    expect(indicator.getLatestFrame()).toMatchObject({
      outputType: "distribution",
      bins: [
        [0, 1],
        [1, 3],
      ],
      runSampleCount: 4,
    });
  });

  it("clears the per-run aggregates with the rest", () => {
    const indicator = metric({ aggregateTime: "min" });
    indicator.observeFrame(frameContext(0, { 0: 0 }));
    indicator.clear();
    expect(indicator.getRunValues().size).toBe(0);
    indicator.observeFrame(frameContext(0, { 0: 1 }));
    expect([...indicator.getRunValues()]).toEqual([[0, 1]]);
  });
});
