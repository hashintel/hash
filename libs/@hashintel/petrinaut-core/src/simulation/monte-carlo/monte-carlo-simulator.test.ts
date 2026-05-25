import { describe, expect, it } from "vitest";

import { createMonteCarloUserDefinedMetric } from "./metrics";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

import type { SDCPN } from "../../types/sdcpn";

const sdcpn: SDCPN = {
  types: [
    {
      id: "type-product",
      name: "Product",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [{ elementId: "quality", name: "quality", type: "real" }],
    },
  ],
  places: [
    {
      id: "source",
      name: "Source",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "product",
      name: "Product",
      colorId: "type-product",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "make-product",
      name: "Make Product",
      inputArcs: [{ placeId: "source", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "product", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode:
        "export default TransitionKernel(() => ({ Product: [{ quality: 1 }] }));",
      x: 50,
      y: 0,
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "param-quality",
      name: "Quality",
      variableName: "quality",
      type: "real",
      defaultValue: "1",
    },
  ],
};

const selfLoopSdcpn: SDCPN = {
  types: [],
  places: [
    {
      id: "source",
      name: "Source",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "loop",
      name: "Loop",
      inputArcs: [{ placeId: "source", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "source", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 50,
      y: 0,
    },
  ],
  differentialEquations: [],
  parameters: [],
};

describe("MonteCarloSimulator", () => {
  it("runs multiple independent simulations without retaining frame history", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn,
      runCount: 2,
      initialMarking: { source: 1 },
      runs: [
        { seed: 10, initialMarking: { source: 1 } },
        { seed: 20, initialMarking: { source: 2 } },
      ],
      dt: 1,
      maxTime: 20,
      initialTokenValueCapacity: 0,
    });

    const result = simulator.runUntilComplete({ maxBatches: 20 });

    expect(result.allFinished).toBe(true);
    expect(result.completedRuns).toBe(2);
    expect(result.erroredRuns).toBe(0);

    const firstRun = simulator.getRunSnapshot(0);
    const secondRun = simulator.getRunSnapshot(1);

    expect(firstRun.status).toBe("complete");
    expect(firstRun.completionReason).toBe("deadlock");
    expect(firstRun.seed).toBe(10);
    expect(firstRun.placeTokenCounts).toMatchObject({
      source: 0,
      product: 1,
    });
    expect(firstRun.tokenValueCount).toBe(1);
    expect(firstRun.tokenValueCapacity).toBeGreaterThan(
      firstRun.tokenValueCount,
    );
    expect(firstRun.reallocations).toBeGreaterThan(0);

    expect(secondRun.status).toBe("complete");
    expect(secondRun.completionReason).toBe("deadlock");
    expect(secondRun.seed).toBe(20);
    expect(secondRun.placeTokenCounts).toMatchObject({
      source: 0,
      product: 2,
    });
    expect(secondRun.tokenValueCount).toBe(2);
  });

  it("advances active runs in deterministic round-robin batches", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn,
      runCount: 3,
      initialMarking: { source: 1 },
      seed: 100,
      dt: 1,
      maxTime: 10,
    });

    const result = simulator.advanceAll();

    expect(result.advancedRuns).toBe(3);
    expect(result.activeRuns).toBe(3);
    expect(simulator.getSummaries().map((run) => run.frameNumber)).toEqual([
      1, 1, 1,
    ]);
  });

  it("derives completion and metric time from frame numbers", () => {
    const frameMetric = createMonteCarloUserDefinedMetric({
      id: "frame-number",
      label: "Frame number",
      sampleRuns: "all",
      aggregateRuns: "mean",
      aggregateTime: "none",
      measure: ({ frame }) => frame.number,
    });
    const simulator = createMonteCarloSimulator({
      sdcpn: selfLoopSdcpn,
      runCount: 1,
      initialMarking: { source: 1 },
      seed: 100,
      dt: 0.1,
      maxTime: 1,
      metrics: [frameMetric],
    });

    const result = simulator.runUntilComplete();
    const summary = simulator.getRunSummary(0);

    expect(result.allFinished).toBe(true);
    expect(summary.status).toBe("complete");
    expect(summary.completionReason).toBe("maxTime");
    expect(summary.frameNumber).toBe(10);
    expect(summary.currentTime).toBe(1);
    expect(frameMetric.frames).toHaveLength(11);
    expect(frameMetric.frames.at(-1)).toMatchObject({
      frameNumber: 10,
      time: 1,
      value: 10,
    });
  });

  it("supports user-defined scalar metrics with run and time aggregation", () => {
    const sourceAverageMetric = createMonteCarloUserDefinedMetric({
      id: "source-average",
      label: "Average source tokens",
      sampleRuns: "all",
      aggregateRuns: "mean",
      aggregateTime: "mean",
      measure: ({ frame }) => frame.getPlaceTokenCount("source"),
    });
    const simulator = createMonteCarloSimulator({
      sdcpn,
      runCount: 2,
      initialMarking: { source: 1 },
      runs: [
        { seed: 10, initialMarking: { source: 1 } },
        { seed: 20, initialMarking: { source: 2 } },
      ],
      dt: 1,
      maxTime: 20,
      metrics: [sourceAverageMetric],
    });

    expect(sourceAverageMetric.getLatestFrame()).toMatchObject({
      metricId: "source-average",
      value: 1.5,
      frameValue: 1.5,
      timeValue: 1.5,
      runSampleCount: 2,
      timeSampleCount: 1,
    });

    simulator.advanceAll();

    expect(sourceAverageMetric.getLatestFrame()).toMatchObject({
      frameNumber: 1,
      value: 1,
      frameValue: 0.5,
      timeValue: 1,
      runSampleCount: 2,
      timeSampleCount: 2,
    });
  });
});
