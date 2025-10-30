import { describe, expect, it } from "vitest";

import { computePossibleTransition } from "./compute-possible-transition";
import type { SimulationFrame, SimulationInstance } from "./types";

describe("computePossibleTransition", () => {
  it("returns null when transition is not enabled due to insufficient tokens", () => {
    // GIVEN a frame with a place that doesn't have enough tokens
    const simulation: SimulationInstance = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [],
        transitions: [],
      },
      places: new Map(),
      transitions: new Map(),
      differentialEquationFns: new Map(),
      lambdaFns: new Map([["t1", () => 1.0]]),
      transitionKernelFns: new Map([["t1", () => [[[1.0]]]]]),
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
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 0,
            count: 1, // Only 1 token available
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
              inputArcs: [{ placeId: "p1", weight: 2 }], // Requires 2 tokens
              outputArcs: [],
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return [[[1.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([1.0]),
    };

    // WHEN computing possible transition
    const result = computePossibleTransition(frame, "t1");

    // THEN it should return null (transition not enabled)
    expect(result).toBeNull();
  });

  it("returns token combinations when transition is enabled and fires", () => {
    // GIVEN a frame with sufficient tokens and favorable random conditions
    const simulation: SimulationInstance = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [],
        transitions: [],
      },
      places: new Map(),
      transitions: new Map(),
      differentialEquationFns: new Map(),
      // Lambda function that returns a high value to ensure transition fires
      lambdaFns: new Map([["t1", () => 10.0]]),
      // Kernel function that returns new token values
      transitionKernelFns: new Map([
        [
          "t1",
          (_tokenValues) => {
            // Return the same structure with modified values
            return [[[2.0]]];
          },
        ],
      ]),
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
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 0,
            count: 2, // 2 tokens available
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
              inputArcs: [{ placeId: "p1", weight: 1 }], // Requires 1 token
              outputArcs: [],
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[2.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([1.0, 1.5]),
    };

    // WHEN computing possible transition
    const result = computePossibleTransition(frame, "t1");

    // THEN it should return the result from the transition kernel
    expect(result).not.toBeNull();
    expect(result).toEqual([[[2.0]]]);
  });
});
