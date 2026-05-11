import { describe, expect, it } from "vitest";

import type { InitialMarking } from "../api";
import type { SDCPN } from "../../types/sdcpn";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

const staticUntypedNet: SDCPN = {
  places: [
    {
      id: "p1",
      name: "P1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

function createUntypedInitialMarking(count: number): InitialMarking {
  return { p1: count };
}

describe("createMonteCarloSimulator", () => {
  it("aggregates place token counts without retaining concrete frames", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn: staticUntypedNet,
      initialMarking: createUntypedInitialMarking(4),
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
      maxFrames: 4,
      runCount: 3,
    });

    const result = simulator.run();

    expect(result.runCount).toBe(3);
    expect(result.frameCount).toBe(2);
    expect(result.stopReasons).toEqual({
      deadlock: 3,
      maxTime: 0,
      frameLimit: 0,
    });
    expect(result.frames.times).toEqual(new Float64Array([0, 0.1]));
    expect(result.frames.samples).toEqual(new Uint32Array([3, 3]));
    expect(result.placeTokenCounts.ids).toEqual(["p1"]);
    expect(result.placeTokenCounts.samples).toEqual(new Uint32Array([3, 3]));
    expect(result.placeTokenCounts.mean).toEqual(new Float64Array([4, 4]));
    expect(result.placeTokenCounts.min).toEqual(new Float64Array([4, 4]));
    expect(result.placeTokenCounts.max).toEqual(new Float64Array([4, 4]));
  });

  it("samples metric hooks into per-frame stats and overall distributions", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn: staticUntypedNet,
      initialMarking: createUntypedInitialMarking(4),
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
      maxFrames: 4,
      runCount: 3,
      metrics: [
        {
          id: "tokens-plus-run",
          sample: (frame, context) =>
            frame.getPlaceTokenCount("p1") + context.runIndex,
          distribution: { bucketSize: 1 },
        },
      ],
    });

    const result = simulator.run();

    expect(result.metrics.ids).toEqual(["tokens-plus-run"]);
    expect(result.metrics.samples).toEqual(new Uint32Array([3, 3]));
    expect(result.metrics.mean).toEqual(new Float64Array([5, 5]));
    expect(result.metrics.min).toEqual(new Float64Array([4, 4]));
    expect(result.metrics.max).toEqual(new Float64Array([6, 6]));
    expect(result.metrics.distributions["tokens-plus-run"]).toEqual({
      bucketSize: 1,
      buckets: [
        { start: 4, end: 5, count: 2 },
        { start: 5, end: 6, count: 2 },
        { start: 6, end: 7, count: 2 },
      ],
      underflow: 0,
      overflow: 0,
    });
  });

  it("derives different seeds for concrete simulations", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn: staticUntypedNet,
      initialMarking: createUntypedInitialMarking(0),
      parameterValues: {},
      seed: 7,
      dt: 0.1,
      maxTime: null,
      maxFrames: 1,
      runCount: 3,
      metrics: [
        {
          id: "seed",
          sample: (_frame, context) => context.runSeed,
        },
      ],
    });

    const result = simulator.run();

    expect(result.stopReasons.frameLimit).toBe(3);
    expect(result.metrics.samples).toEqual(new Uint32Array([3]));
    expect(result.metrics.min[0]).not.toBe(result.metrics.max[0]);
  });

  it("requires maxFrames when maxTime is not set", () => {
    expect(() =>
      createMonteCarloSimulator({
        sdcpn: staticUntypedNet,
        initialMarking: createUntypedInitialMarking(0),
        parameterValues: {},
        seed: 7,
        dt: 0.1,
        maxTime: null,
        runCount: 1,
      }),
    ).toThrow("Monte Carlo maxFrames is required when maxTime is null");
  });
});
