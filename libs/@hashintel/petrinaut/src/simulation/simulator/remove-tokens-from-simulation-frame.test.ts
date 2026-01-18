import { describe, expect, it } from "vitest";

import type { SimulationFrame, SimulationInstance } from "./types";
import { removeTokensFromSimulationFrame } from "./remove-tokens-from-simulation-frame";

describe("removeTokensFromSimulationFrame", () => {
  it("throws error when place ID is not found", () => {
    const simulation: SimulationInstance = {
      types: new Map(),
      places: new Map(),
      transitions: new Map(),
      differentialEquationFns: new Map(),
      lambdaFns: new Map(),
      transitionKernelFns: new Map(),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      simulation,
      time: 0,
      places: new Map(),
      transitions: new Map(),
      buffer: new Float64Array([]),
    };

    expect(() => {
      removeTokensFromSimulationFrame(
        frame,
        new Map([["nonexistent", new Set([0])]]),
      );
    }).toThrow("Place with ID nonexistent not found");
  });

  it("returns frame unchanged when tokens map is empty", () => {
    const simulation: SimulationInstance = {
      types: new Map(),
      places: new Map(),
      transitions: new Map(),
      differentialEquationFns: new Map(),
      lambdaFns: new Map(),
      transitionKernelFns: new Map(),
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
            count: 3,
            dimensions: 2,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]),
    };

    const result = removeTokensFromSimulationFrame(frame, new Map());
    expect(result).toBe(frame);
  });
});
