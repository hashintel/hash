import { describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../../core/types/sdcpn";
import { buildSimulation } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";

// Mock SymPy compilation with realistic functions for these tests
vi.mock("./compile-via-sympy", () => ({
  compileDifferentialEquationViaSymPy: vi
    .fn()
    .mockImplementation((code: string) => {
      // Parse simple dynamics patterns from test code
      if (code.includes("({ x: 1, y: 1 })")) {
        return Promise.resolve((tokens: Record<string, number>[]) =>
          tokens.map(() => ({ x: 1, y: 1 })),
        );
      }
      if (code.includes("({ x: 1 })")) {
        return Promise.resolve((tokens: Record<string, number>[]) =>
          tokens.map(() => ({ x: 1 })),
        );
      }
      return Promise.resolve(() => []);
    }),
  compileLambdaViaSymPy: vi.fn().mockImplementation((code: string) => {
    if (code.includes("0.0001")) {
      return Promise.resolve(() => 0.0001);
    }
    return Promise.resolve(() => 1.0);
  }),
  compileTransitionKernelViaSymPy: vi
    .fn()
    .mockImplementation((code: string) => {
      if (code.includes("Place1")) {
        return Promise.resolve(() => ({
          Place1: [{ x: 100.0, y: 200.0 }],
        }));
      }
      return Promise.resolve(() => ({}));
    }),
}));

const mockPyodide = {} as Parameters<typeof buildSimulation>[1];

describe("computeNextFrame", () => {
  it("should compute next frame with dynamics and transitions", async () => {
    // GIVEN a simple SDCPN with one place and one transition
    const sdcpn: SDCPN = {
      types: [
        {
          id: "type1",
          name: "Type 1",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [
            { elementId: "elem1", name: "x", type: "real" },
            { elementId: "elem2", name: "y", type: "real" },
          ],
        },
      ],
      differentialEquations: [
        {
          id: "diffeq1",
          name: "Differential Equation 1",
          colorId: "type1",
          code: "export default Dynamics((tokens, parameters) => { return tokens.map(token => ({ x: 1, y: 1 })); });",
        },
      ],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: "type1",
          dynamicsEnabled: true,
          differentialEquationId: "diffeq1",
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t1",
          name: "Transition 1",
          inputArcs: [{ placeId: "p1", weight: 1 }],
          outputArcs: [{ placeId: "p1", weight: 1 }],
          lambdaType: "stochastic",
          lambdaCode:
            "export default Lambda((tokens, parameters) => { return 0.0001; });", // Very low probability
          transitionKernelCode:
            "export default TransitionKernel((tokens, parameters) => { return { 'Place1': [{ x: 100.0, y: 200.0 }] }; });",
          x: 100,
          y: 0,
        },
      ],
    };

    const initialMarking = new Map([
      ["p1", { values: new Float64Array([10.0, 20.0]), count: 1 }],
    ]);

    // Build the simulation
    const simulation = await buildSimulation(
      {
        sdcpn,
        initialMarking,
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      },
      mockPyodide,
    );

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN the simulation should have 2 frames now
    expect(result.simulation.frames).toHaveLength(2);
    expect(result.simulation.currentFrameNumber).toBe(1);
    // No transition should have fired (low probability)
    expect(result.transitionFired).toBe(false);

    // The new frame should have time = dt
    const nextFrame = result.simulation.frames[1]!;
    expect(nextFrame.time).toBe(0.1);

    // The buffer should reflect dynamics (values should have increased by derivative * dt)
    // Initial: [10, 20], derivative: [1, 1], dt: 0.1
    // Expected after dynamics: [10.1, 20.1]
    expect(nextFrame.buffer[0]).toBeCloseTo(10.1);
    expect(nextFrame.buffer[1]).toBeCloseTo(20.1);
  });

  it("should skip dynamics for places without type", async () => {
    // GIVEN a place without a type
    const sdcpn: SDCPN = {
      types: [],
      differentialEquations: [],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: null,
          dynamicsEnabled: true,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    };

    const initialMarking = new Map([
      ["p1", { values: new Float64Array([]), count: 0 }],
    ]);

    const simulation = await buildSimulation(
      {
        sdcpn,
        initialMarking,
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      },
      mockPyodide,
    );

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN it should complete without error
    expect(result.simulation.frames).toHaveLength(2);
    expect(result.transitionFired).toBe(false);
  });

  it("should skip dynamics for places with dynamics disabled", async () => {
    // GIVEN a place with dynamics disabled
    const sdcpn: SDCPN = {
      types: [
        {
          id: "type1",
          name: "Type 1",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [{ elementId: "elem1", name: "x", type: "real" }],
        },
      ],
      differentialEquations: [
        {
          id: "diffeq1",
          name: "Differential Equation 1",
          colorId: "type1",
          code: "export default Dynamics((tokens, parameters) => { return tokens.map(token => ({ x: 1 })); });",
        },
      ],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          colorId: "type1",
          dynamicsEnabled: false,
          differentialEquationId: "diffeq1",
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    };

    const initialMarking = new Map([
      ["p1", { values: new Float64Array([10.0]), count: 1 }],
    ]);

    const simulation = await buildSimulation(
      {
        sdcpn,
        initialMarking,
        parameterValues: {},
        seed: 42,
        dt: 0.1,
        maxTime: null,
      },
      mockPyodide,
    );

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN the buffer should be unchanged (no dynamics applied)
    const nextFrame = result.simulation.frames[1]!;
    expect(nextFrame.buffer[0]).toBe(10.0);
    expect(result.transitionFired).toBe(false);
  });
});
