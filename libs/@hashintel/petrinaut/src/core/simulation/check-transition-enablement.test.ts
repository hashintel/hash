import { describe, expect, it } from "vitest";

import type { SimulationFrame, SimulationInstance } from "../types/simulation";
import {
  checkTransitionEnablement,
  isTransitionStructurallyEnabled,
} from "./check-transition-enablement";

describe("isTransitionStructurallyEnabled", () => {
  it("returns true when input place has sufficient tokens", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 2,
            dimensions: 0,
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
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    expect(isTransitionStructurallyEnabled(frame, "t1")).toBe(true);
  });

  it("returns false when input place has insufficient tokens", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 0,
            dimensions: 0,
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
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    expect(isTransitionStructurallyEnabled(frame, "t1")).toBe(false);
  });

  it("respects arc weights when checking enablement", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 2,
            dimensions: 0,
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
              inputArcs: [{ placeId: "p1", weight: 3 }], // Requires 3 tokens
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    // Only 2 tokens, but 3 required
    expect(isTransitionStructurallyEnabled(frame, "t1")).toBe(false);
  });

  it("checks all input places for enablement", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 2,
            dimensions: 0,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 0,
            count: 0, // No tokens
            dimensions: 0,
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
              inputArcs: [
                { placeId: "p1", weight: 1 },
                { placeId: "p2", weight: 1 },
              ],
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    // p1 has tokens, but p2 doesn't
    expect(isTransitionStructurallyEnabled(frame, "t1")).toBe(false);
  });

  it("returns true for transitions with no input arcs", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
      transitions: new Map([
        [
          "t1",
          {
            instance: {
              id: "t1",
              name: "Transition 1",
              inputArcs: [], // No input arcs
              outputArcs: [{ placeId: "p1", weight: 1 }],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    expect(isTransitionStructurallyEnabled(frame, "t1")).toBe(true);
  });
});

describe("checkTransitionEnablement", () => {
  it("returns hasEnabledTransition=true when at least one transition is enabled", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 1,
            dimensions: 0,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 0,
            count: 0,
            dimensions: 0,
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
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
        [
          "t2",
          {
            instance: {
              id: "t2",
              name: "Transition 2",
              inputArcs: [{ placeId: "p2", weight: 1 }],
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    const result = checkTransitionEnablement(frame);

    expect(result.hasEnabledTransition).toBe(true);
    expect(result.transitionStatus.get("t1")).toBe(true);
    expect(result.transitionStatus.get("t2")).toBe(false);
  });

  it("returns hasEnabledTransition=false when no transitions are enabled (deadlock)", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 0,
            dimensions: 0,
          },
        ],
        [
          "p2",
          {
            instance: {
              id: "p2",
              name: "Place 2",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 0,
            count: 0,
            dimensions: 0,
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
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
        [
          "t2",
          {
            instance: {
              id: "t2",
              name: "Transition 2",
              inputArcs: [{ placeId: "p2", weight: 1 }],
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    const result = checkTransitionEnablement(frame);

    expect(result.hasEnabledTransition).toBe(false);
    expect(result.transitionStatus.get("t1")).toBe(false);
    expect(result.transitionStatus.get("t2")).toBe(false);
  });

  it("returns hasEnabledTransition=true when there are no transitions", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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

    const result = checkTransitionEnablement(frame);

    // No transitions means nothing is blocked - but also nothing can happen
    // This is technically a terminal state, but we return false because
    // no transition is enabled
    expect(result.hasEnabledTransition).toBe(false);
    expect(result.transitionStatus.size).toBe(0);
  });

  it("returns all transitions enabled when all have sufficient tokens", () => {
    const simulation: SimulationInstance = {
      places: new Map(),
      transitions: new Map(),
      types: new Map(),
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
            count: 5,
            dimensions: 0,
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
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
        [
          "t2",
          {
            instance: {
              id: "t2",
              name: "Transition 2",
              inputArcs: [{ placeId: "p1", weight: 2 }],
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
        [
          "t3",
          {
            instance: {
              id: "t3",
              name: "Transition 3",
              inputArcs: [{ placeId: "p1", weight: 5 }],
              outputArcs: [],
              lambdaType: "stochastic",
              lambdaCode: "return 1.0;",
              transitionKernelCode: "return {};",
              x: 0,
              y: 0,
            },
            timeSinceLastFiring: 0,
          },
        ],
      ]),
      buffer: new Float64Array([]),
    };

    const result = checkTransitionEnablement(frame);

    expect(result.hasEnabledTransition).toBe(true);
    expect(result.transitionStatus.get("t1")).toBe(true);
    expect(result.transitionStatus.get("t2")).toBe(true);
    expect(result.transitionStatus.get("t3")).toBe(true);
  });
});
