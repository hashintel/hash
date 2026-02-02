import { describe, expect, it } from "vitest";

import { executeTransitions } from "./execute-transitions";
import type { SimulationFrame, SimulationInstance } from "./types";

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
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 0, // No tokens
          dimensions: 1,
        },
      },
      transitions: {
        t1: {
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
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    expect(result.frame).toBe(frame);
    expect(result.transitionFired).toBe(false);
  });

  it("removes tokens and adds new tokens when a single transition fires", () => {
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
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
      ]),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 2,
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
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[2.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    // Token should be removed from p1
    expect(result.frame.places.p1?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(1.5); // Second token from p1 remains

    // Token should be added to p2
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[1]).toBe(2.0); // New token in p2

    // Time should be incremented
    expect(result.frame.time).toBe(0.1);

    // Transition that fired should have timeSinceLastFiringMs reset to 0
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.transitionFired).toBe(true);
  });

  it("executes multiple transitions sequentially with proper token removal between each", () => {
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
        [
          "p3",
          {
            id: "p3",
            name: "Place 3",
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
      lambdaFns: new Map([
        ["t1", () => 10.0],
        ["t2", () => 10.0],
      ]),
      transitionKernelFns: new Map<
        string,
        () => Record<string, Record<string, number>[]>
      >([
        ["t1", () => ({ "Place 2": [{ x: 5.0 }] })],
        ["t2", () => ({ "Place 3": [{ x: 10.0 }] })],
      ]),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 3, // 3 tokens in p1
          dimensions: 1,
        },
        p2: {
          offset: 3,
          count: 0,
          dimensions: 1,
        },
        p3: {
          offset: 3,
          count: 0,
          dimensions: 1,
        },
      },
      transitions: {
        t1: {
          instance: {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[5.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
        t2: {
          instance: {
            id: "t2",
            name: "Transition 2",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p3", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[10.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    // Both transitions should consume one token from p1 each
    // So p1 should have 1 token remaining
    expect(result.frame.places.p1?.count).toBe(1);

    // p2 should have 1 token added by t1
    expect(result.frame.places.p2?.count).toBe(1);

    // p3 should have 1 token added by t2
    expect(result.frame.places.p3?.count).toBe(1);

    // Both transitions should have their timeSinceLastFiringMs reset
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0);
  });

  it("handles transitions with multi-dimensional tokens", () => {
    const simulation: SimulationInstance = {
      places: new Map([
        [
          "p1",
          {
            id: "p1",
            name: "Place 1",
            colorId: "type2",
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
            colorId: "type2",
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
          "type2",
          {
            id: "type2",
            name: "Type2",
            iconSlug: "square",
            displayColor: "#00FF00",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
      ]),
      differentialEquationFns: new Map(),
      lambdaFns: new Map([["t1", () => 10.0]]),
      transitionKernelFns: new Map([
        [
          "t1",
          (_tokens) => {
            // Transform input token [1.0, 2.0] to output [3.0, 4.0]
            return { "Place 2": [{ x: 3.0, y: 4.0 }] };
          },
        ],
      ]),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 1,
          dimensions: 2,
        },
        p2: {
          offset: 2,
          count: 0,
          dimensions: 2,
        },
      },
      transitions: {
        t1: {
          instance: {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[3.0, 4.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 1.0,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0, 2.0]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    // p1 should have no tokens
    expect(result.frame.places.p1?.count).toBe(0);

    // p2 should have 1 token with values [3.0, 4.0]
    expect(result.frame.places.p2?.count).toBe(1);
    expect(result.frame.buffer[0]).toBe(3.0);
    expect(result.frame.buffer[1]).toBe(4.0);
  });

  it("updates timeSinceLastFiringMs for transitions that did not fire", () => {
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
      lambdaFns: new Map([
        ["t1", () => 10.0], // High lambda, will fire
        ["t2", () => 0.001], // Low lambda, won't fire
      ]),
      transitionKernelFns: new Map<
        string,
        () => Record<string, Record<string, number>[]>
      >([
        ["t1", () => ({ "Place 2": [{ x: 2.0 }] })],
        ["t2", () => ({ "Place 2": [{ x: 3.0 }] })],
      ]),
      parameterValues: {},
      dt: 0.1,
      rngState: 42,
      frames: [],
      currentFrameNumber: 0,
    };

    const frame: SimulationFrame = {
      time: 0,
      places: {
        p1: {
          offset: 0,
          count: 2,
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
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 10.0;",
            transitionKernelCode: "return [[[2.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 0.5,
          firedInThisFrame: false,
          firingCount: 0,
        },
        t2: {
          instance: {
            id: "t2",
            name: "Transition 2",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "return 0.001;",
            transitionKernelCode: "return [[[3.0]]];",
            x: 0,
            y: 0,
          },
          timeSinceLastFiringMs: 0.3,
          firedInThisFrame: false,
          firingCount: 0,
        },
      },
      buffer: new Float64Array([1.0, 1.5]),
    };

    const result = executeTransitions(
      frame,
      simulation,
      simulation.dt,
      simulation.rngState,
    );

    // t1 should have fired and timeSinceLastFiringMs reset
    expect(result.frame.transitions.t1?.timeSinceLastFiringMs).toBe(0);

    // t2 should not have fired and timeSinceLastFiringMs incremented by dt
    expect(result.frame.transitions.t2?.timeSinceLastFiringMs).toBe(0.4);
  });
});
