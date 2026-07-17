import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "./metrics";
import { createMonteCarloSimulator as createMonteCarloSimulatorRaw } from "./monte-carlo-simulator";

import type { SDCPN } from "../../types/sdcpn";
import type { MonteCarloSimulatorConfig } from "./types";

/** createMonteCarloSimulator with HIR artifacts compiled from the config's
 * SDCPN (the engine no longer compiles user code itself). */
function createMonteCarloSimulator(
  config: MonteCarloSimulatorConfig,
): ReturnType<typeof createMonteCarloSimulatorRaw> {
  return createMonteCarloSimulatorRaw({
    ...config,
    hirArtifacts:
      config.hirArtifacts ??
      compileHirArtifacts(config.sdcpn, config.extensions).artifacts,
  });
}

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

const readArcSdcpn: SDCPN = {
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
      id: "guard",
      name: "Guard",
      colorId: "type-product",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 0,
    },
    {
      id: "product",
      name: "Product",
      colorId: "type-product",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 200,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "make-product",
      name: "Make Product",
      inputArcs: [
        { placeId: "source", weight: 1, type: "standard" },
        { placeId: "guard", weight: 1, type: "read" },
      ],
      outputArcs: [{ placeId: "product", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode:
        "export default TransitionKernel((input) => ({ Product: [{ quality: input.Guard[0].quality }] }));",
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
      initialTokenByteCapacity: 0,
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
    // "product" tokens carry one real element → 8-byte stride per token.
    expect(firstRun.tokenByteCount).toBe(8);
    expect(firstRun.tokenByteCapacity).toBeGreaterThan(firstRun.tokenByteCount);
    expect(firstRun.reallocations).toBeGreaterThan(0);

    expect(secondRun.status).toBe("complete");
    expect(secondRun.completionReason).toBe("deadlock");
    expect(secondRun.seed).toBe(20);
    expect(secondRun.placeTokenCounts).toMatchObject({
      source: 0,
      product: 2,
    });
    expect(secondRun.tokenByteCount).toBe(16);
  });

  it("does not consume tokens read by read arcs", () => {
    const productQualityMetric = createMonteCarloUserDefinedMetric({
      id: "product-quality",
      label: "Product quality",
      sampleRuns: "all",
      aggregateRuns: "last",
      aggregateTime: "none",
      measure: ({ frame }) => {
        const token = frame.getPlaceTokens(
          readArcSdcpn.places.find(
            (sdcpnPlace) => sdcpnPlace.id === "product",
          )!,
        )[0];
        return token ? Number(token.quality) : undefined;
      },
    });
    const simulator = createMonteCarloSimulator({
      sdcpn: readArcSdcpn,
      runCount: 1,
      initialMarking: {
        source: 1,
        guard: [{ quality: 7 }],
      },
      seed: 100,
      dt: 1,
      maxTime: 10,
      metrics: [productQualityMetric],
    });

    const result = simulator.runUntilComplete({ maxBatches: 10 });
    const run = simulator.getRunSnapshot(0);

    expect(result.allFinished).toBe(true);
    expect(run.status).toBe("complete");
    expect(run.completionReason).toBe("deadlock");
    expect(run.placeTokenCounts).toMatchObject({
      source: 0,
      guard: 1,
      product: 1,
    });
    expect(productQualityMetric.getLatestFrame()).toMatchObject({
      value: 7,
    });
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

  it("reports sample counts for distribution metrics without time aggregation", () => {
    const sourceDistributionMetric = createMonteCarloUserDefinedMetric({
      id: "source-distribution",
      label: "Source token distribution",
      sampleRuns: "all",
      runOutput: { type: "distribution" },
      aggregateTime: "none",
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
      metrics: [sourceDistributionMetric],
    });

    expect(sourceDistributionMetric.getLatestFrame()).toMatchObject({
      outputType: "distribution",
      runSampleCount: 2,
      timeSampleCount: 2,
    });

    simulator.advanceAll();

    expect(sourceDistributionMetric.getLatestFrame()).toMatchObject({
      frameNumber: 1,
      outputType: "distribution",
      runSampleCount: 2,
      timeSampleCount: 2,
    });
  });

  it("runs string elements end-to-end: kernel interning, metric decode via the run pool", () => {
    const stringSdcpn: SDCPN = {
      types: [
        {
          id: "type-order",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#00FF00",
          elements: [
            { elementId: "status", name: "status", type: "string" },
            { elementId: "value", name: "value", type: "real" },
          ],
        },
      ],
      places: [
        {
          id: "pending",
          name: "Pending",
          colorId: "type-order",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "done",
          name: "Done",
          colorId: "type-order",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "ship",
          name: "Ship",
          inputArcs: [{ placeId: "pending", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "done", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode:
            'export default Lambda((input) => input.Pending[0].status === "queued");',
          transitionKernelCode:
            'export default TransitionKernel((input) => ({ Done: [{ status: "shipped", value: input.Pending[0].value }] }));',
          x: 50,
          y: 0,
        },
      ],
      differentialEquations: [],
      parameters: [],
    };

    const shippedCountMetric = createMonteCarloUserDefinedMetric({
      id: "shipped-count",
      label: "Shipped orders",
      sampleRuns: "all",
      aggregateRuns: "last",
      aggregateTime: "none",
      measure: ({ frame }) =>
        frame
          .getPlaceTokens(
            stringSdcpn.places.find((sdcpnPlace) => sdcpnPlace.id === "done")!,
          )
          .filter((token) => token.status === "shipped").length,
    });

    const simulator = createMonteCarloSimulator({
      sdcpn: stringSdcpn,
      runCount: 1,
      initialMarking: {
        pending: [{ status: "queued", value: 7 }],
      },
      seed: 100,
      dt: 1,
      maxTime: 10,
      metrics: [shippedCountMetric],
    });

    const result = simulator.runUntilComplete({ maxBatches: 20 });
    const run = simulator.getRunSnapshot(0);

    expect(result.allFinished).toBe(true);
    expect(run.status).toBe("complete");
    expect(run.placeTokenCounts).toMatchObject({ pending: 0, done: 1 });
    expect(shippedCountMetric.getLatestFrame()).toMatchObject({ value: 1 });
  });

  it("runs HIR-compiled expression metrics against the raw frame buffers", () => {
    const metricCode = `const done = state.places.Done.tokens;
const backlog = state.places.Pending.tokens.concat(done);
if (backlog.length === 0) return -1;
return done.reduce(
  (sum, order) => order.status === "shipped" ? sum + order.value : sum,
  0,
) + backlog.length;`;

    const expressionSdcpn: SDCPN = {
      types: [
        {
          id: "type-order",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#00FF00",
          elements: [
            { elementId: "status", name: "status", type: "string" },
            { elementId: "value", name: "value", type: "real" },
          ],
        },
      ],
      places: [
        {
          id: "pending",
          name: "Pending",
          colorId: "type-order",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
        {
          id: "done",
          name: "Done",
          colorId: "type-order",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 100,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "ship",
          name: "Ship",
          inputArcs: [{ placeId: "pending", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "done", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode:
            'export default Lambda((input) => input.Pending[0].status === "queued");',
          transitionKernelCode:
            'export default TransitionKernel((input) => ({ Done: [{ status: "shipped", value: input.Pending[0].value }] }));',
          x: 50,
          y: 0,
        },
      ],
      differentialEquations: [],
      parameters: [],
      metrics: [
        { id: "shipped-value", name: "Shipped value", code: metricCode },
      ],
    };

    const { artifacts, failures } = compileHirArtifacts(expressionSdcpn);
    expect(failures).toEqual([]);
    const artifact = artifacts.metrics["shipped-value"];
    expect(artifact).toBeDefined();

    const [config] = createMonteCarloUserDefinedMetricConfigsFromSpecs(
      [
        {
          id: "shipped-value",
          label: "Shipped value",
          kind: "expression",
          code: metricCode,
          artifact: artifact!,
          sampleRuns: "all",
          aggregateRuns: "last",
          aggregateTime: "none",
        },
      ],
      expressionSdcpn,
    );
    const metric = createMonteCarloUserDefinedMetric(config!);

    const simulator = createMonteCarloSimulator({
      sdcpn: expressionSdcpn,
      hirArtifacts: artifacts,
      runCount: 2,
      initialMarking: {
        pending: [{ status: "queued", value: 7 }],
      },
      seed: 100,
      dt: 1,
      maxTime: 10,
      metrics: [metric],
    });

    // Frame 0: nothing shipped yet — one pending order → 0 + 1.
    expect(metric.getLatestFrame()).toMatchObject({ value: 1 });

    const result = simulator.runUntilComplete({ maxBatches: 20 });
    expect(result.allFinished).toBe(true);
    // Shipped order value 7 + one order total in the backlog concat.
    expect(metric.getLatestFrame()).toMatchObject({ value: 8 });
  });

  it("reads each run's own net parameters when overridden per run", () => {
    // A metric that only reads an ambient net parameter. Monte-Carlo overrides
    // the parameter per run, so the two runs must report their own values —
    // not the shared config value baked in once at experiment init.
    const metricCode = `return parameters.weight;`;

    const parameterizedSdcpn: SDCPN = {
      types: [],
      places: [
        {
          id: "p",
          name: "P",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      differentialEquations: [],
      parameters: [
        {
          id: "weight",
          name: "Weight",
          variableName: "weight",
          type: "real",
          defaultValue: "1",
        },
      ],
      metrics: [{ id: "weight-metric", name: "Weight", code: metricCode }],
    };

    const { artifacts, failures } = compileHirArtifacts(parameterizedSdcpn);
    expect(failures).toEqual([]);
    const artifact = artifacts.metrics["weight-metric"];
    expect(artifact).toBeDefined();

    const [config] = createMonteCarloUserDefinedMetricConfigsFromSpecs(
      [
        {
          id: "weight-metric",
          label: "Weight",
          kind: "expression",
          code: metricCode,
          artifact: artifact!,
          sampleRuns: "all",
          aggregateRuns: "mean",
          aggregateTime: "none",
        },
      ],
      parameterizedSdcpn,
      // Construction-time fallback = the config default (weight 1); per-run
      // overrides below must win over it.
      { weight: 1 },
    );
    const metric = createMonteCarloUserDefinedMetric(config!);

    const simulator = createMonteCarloSimulator({
      sdcpn: parameterizedSdcpn,
      hirArtifacts: artifacts,
      runCount: 2,
      initialMarking: {},
      parameterValues: {},
      runs: [
        { parameterValues: { weight: "10" } },
        { parameterValues: { weight: "20" } },
      ],
      seed: 1,
      dt: 1,
      maxTime: 2,
      metrics: [metric],
    });

    const result = simulator.runUntilComplete({ maxBatches: 20 });
    expect(result.allFinished).toBe(true);
    // Mean of the two runs' own weights (10, 20) — not the config default (1).
    expect(metric.getLatestFrame()).toMatchObject({ value: 15 });
  });
});
