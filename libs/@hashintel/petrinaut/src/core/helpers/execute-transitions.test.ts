import { describe, expect, it } from "vitest";

import type { SimulationFrame, SimulationInstance } from "../types";
import { executeTransitions } from "./execute-transitions";

describe("executeTransitions", () => {
  it("returns the original frame when no transitions can fire", () => {
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
            count: 0, // No tokens
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
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return [[[1.0]]];",
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

  it("removes tokens and adds new tokens when a single transition fires", () => {
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
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map([["t1", () => [[[2.0]]]]]),
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
            count: 2,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 2,
            count: 0,
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
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[2.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = executeTransitions(frame);

    // Token should be removed from p1
    expect(result.places.get("p1")?.count).toBe(1);
    expect(result.buffer[0]).toBe(1.5); // Second token from p1 remains

    // Token should be added to p2
    expect(result.places.get("p2")?.count).toBe(1);
    expect(result.buffer[1]).toBe(2.0); // New token in p2

    // Time should be incremented
    expect(result.time).toBe(0.1);

    // Transition that fired should have timeSinceLastFiring reset to 0
    expect(result.transitions.get("t1")?.timeSinceLastFiring).toBe(0);
  });

  it("executes multiple transitions sequentially with proper token removal between each", () => {
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
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 10.0],
      ]),
      transitionKernelFns: new Map([
        ["t1", () => [[[5.0]]]],
        ["t2", () => [[[10.0]]]],
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
            count: 3, // 3 tokens in p1
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 3,
            count: 0,
          },
        ],
        [
          "p3",
          {
            instance: {
              id: "p3",
              name: "Place 3",
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 3,
            count: 0,
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
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[5.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
        [
          "t2",
          {
            instance: {
              id: "t2",
              name: "Transition 2",
              inputArcs: [{ placeId: "p1", weight: 1 }],
              outputArcs: [{ placeId: "p3", weight: 1 }],
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[10.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    };

    const result = executeTransitions(frame);

    // Both transitions should consume one token from p1 each
    // So p1 should have 1 token remaining
    expect(result.places.get("p1")?.count).toBe(1);

    // p2 should have 1 token added by t1
    expect(result.places.get("p2")?.count).toBe(1);

    // p3 should have 1 token added by t2
    expect(result.places.get("p3")?.count).toBe(1);

    // Both transitions should have their timeSinceLastFiring reset
    expect(result.transitions.get("t1")?.timeSinceLastFiring).toBe(0);
    expect(result.transitions.get("t2")?.timeSinceLastFiring).toBe(0);
  });

  it("handles transitions with multi-dimensional tokens", () => {
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
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map([
        [
          "t1",
          (_tokens) => {
            // Transform input token [1.0, 2.0] to output [3.0, 4.0]
            return [[[3.0, 4.0]]];
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
              dimensions: 2,
              differentialEquationCode: "return 0;",
            },
            offset: 0,
            count: 1,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              dimensions: 2,
              differentialEquationCode: "return 0;",
            },
            offset: 2,
            count: 0,
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
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[3.0, 4.0]]];",
            },
            timeSinceLastFiring: 1.0,
          },
        ],
      ]),
      buffer: new Float64Array([1.0, 2.0]),
    };

    const result = executeTransitions(frame);

    // p1 should have no tokens
    expect(result.places.get("p1")?.count).toBe(0);

    // p2 should have 1 token with values [3.0, 4.0]
    expect(result.places.get("p2")?.count).toBe(1);
    expect(result.buffer[0]).toBe(3.0);
    expect(result.buffer[1]).toBe(4.0);
  });

  it("updates timeSinceLastFiring for transitions that did not fire", () => {
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
      lambdaFns: new Map([
        ["t1", () => 10.0], // High lambda, will fire
        ["t2", () => 0.001], // Low lambda, won't fire
      ]),
      transitionKernelFns: new Map([
        ["t1", () => [[[2.0]]]],
        ["t2", () => [[[3.0]]]],
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
            count: 2,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              dimensions: 1,
              differentialEquationCode: "return 0;",
            },
            offset: 2,
            count: 0,
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
              lambdaCode: "return 10.0;",
              transitionKernelCode: "return [[[2.0]]];",
            },
            timeSinceLastFiring: 0.5,
          },
        ],
        [
          "t2",
          {
            instance: {
              id: "t2",
              name: "Transition 2",
              inputArcs: [{ placeId: "p1", weight: 1 }],
              outputArcs: [{ placeId: "p2", weight: 1 }],
              lambdaCode: "return 0.001;",
              transitionKernelCode: "return [[[3.0]]];",
            },
            timeSinceLastFiring: 0.3,
          },
        ],
      ]),
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = executeTransitions(frame);

    // t1 should have fired and timeSinceLastFiring reset
    expect(result.transitions.get("t1")?.timeSinceLastFiring).toBe(0);

    // t2 should not have fired and timeSinceLastFiring incremented by dt
    expect(result.transitions.get("t2")?.timeSinceLastFiring).toBe(0.4);
  });
});
