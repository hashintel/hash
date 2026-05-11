import { describe, expect, it } from "vitest";

import type { SDCPN } from "../../types/sdcpn";
import { createMonteCarloSimulator } from "./monte-carlo-simulator";

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
});
