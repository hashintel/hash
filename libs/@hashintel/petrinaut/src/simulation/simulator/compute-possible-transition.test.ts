import { describe, expect, it } from "vitest";

import { computePossibleTransition } from "./compute-possible-transition";
import type { SimulationFrame, SimulationInstance } from "./types";

describe("computePossibleTransition", () => {
  it("returns null when transition is not enabled due to insufficient tokens", () => {
    // GIVEN a frame with a place that doesn't have enough tokens
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
      differentialEquationFns: new Map(),
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map([["t1", () => ({ p2: [{ x: 1.0 }] })]]),
      parameterValues: {},
      dt: 0.1,
      maxTime: null,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 1, // Only 1 token available
          dimensions: 1,
        },
      },
      transitions: {
        t1: {
          instance: {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 2 }], // Requires 2 tokens
            outputArcs: [],
            lambdaType: "stochastic",
            lambdaCode: "return 1.0;",
            transitionKernelCode: "return [[[1.0]]];",
            x: 100,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0]),
    };

    // WHEN computing possible transition
    const result = computePossibleTransition(frame, simulation, "t1");

    // THEN it should return null (transition not enabled)
    expect(result).toBeNull();
  });

  it("returns token combinations when transition is enabled and fires", () => {
    // GIVEN a frame with sufficient tokens and favorable random conditions
    const simulation: SimulationInstance = {
      places: new Map([
        [
          "p1",
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        [
          "p2",
          {
            id: "p2",
            name: "Place 2",
            colorId: "type1",
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
      ]),
      transitions: new Map(),
      types: new Map([
        [
          "type1",
          {
            id: "type1",
            name: "Type1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
        ],
      ]),
      differentialEquationFns: new Map(),
      // Lambda function that returns a high value to ensure transition fires
      lambdaFns: new Map([["t1", () => 10.0]]),
      // Kernel function that returns new token values
      transitionKernelFns: new Map([
        [
          "t1",
          (_tokenValues) => {
            // Return the same structure with modified values
            return { "Place 2": [{ x: 2.0 }] };
          },
        ],
      ]),
      parameterValues: {},
      dt: 0.1,
      maxTime: null,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 2, // 2 tokens available
          dimensions: 1,
        },
        p2: {
          offset: 2,
          count: 0,
          dimensions: 1,
        },
      },
      transitions: {
        t1: {
          instance: {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1 }], // Requires 1 token
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[2.0]]];",
            x: 100,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0, 1.5]),
    };

    // WHEN computing possible transition
    const result = computePossibleTransition(frame, simulation, "t1");

    // THEN it should return the result from the transition kernel
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      remove: { p1: new Set([0]) },
      add: { p2: [[2.0]] },
    });
    // Also check that newRngState is present and is a number
    expect(result?.newRngState).toBeTypeOf("number");
  });
});
