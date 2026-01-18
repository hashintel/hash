import { describe, expect, it } from "vitest";

import type { SimulationFrame, SimulationInstance } from "./types";
import { executeTransitions } from "./execute-transitions";

describe("executeTransitions", () => {
  it("returns the original frame when no transitions can fire", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
      differentialEquationFns: new Map(),
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map([["t1", () => ({ p2: [{ x: 1.0 }] })]]),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      simulation,
      time: 0,
      places: new Map([
        [
          "p1",
          {
            instance: {
              id: "p1",
              name: "Place 1",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 0,
            count: 0,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map([
        [
          "t1",
          {
            instance: {
              id: "t1",
              name: "Transition 1",
              inputArcs: [{ placeId: "p1", weight: 1 }],
              outputArcs: [{ placeId: "p2", weight: 1 }],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return [[[1.0]]];",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    const result = executeTransitions(frame);
    expect(result).toBe(frame);
  });
});
