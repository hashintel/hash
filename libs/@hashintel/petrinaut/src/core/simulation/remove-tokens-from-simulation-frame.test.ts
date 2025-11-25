import { describe, expect, it } from "vitest";

import type { SimulationFrame, SimulationInstance } from "../types/simulation";
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

  it("throws error when token index is out of bounds", () => {
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
            count: 2,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0]),
    };

    expect(() => {
      removeTokensFromSimulationFrame(frame, new Map([["p1", new Set([3])]]));
    }).toThrow("Invalid token index 3 for place p1. Place has 2 tokens.");
  });

  it("returns frame unchanged when place has empty set of indices", () => {
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
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    };

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set()]]),
    );

    expect(result.buffer).toEqual(new Float64Array([1.0, 2.0, 3.0]));
    expect(result.places.get("p1")?.count).toBe(3);
  });

  it("removes a single token from a place with 1D tokens", () => {
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
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0, 3.0]),
    };

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([1])]]),
    );

    expect(result.buffer).toEqual(new Float64Array([1.0, 3.0]));
    expect(result.places.get("p1")?.count).toBe(2);
    expect(result.places.get("p1")?.offset).toBe(0);
  });

  it("removes multiple tokens from a place with 1D tokens", () => {
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
            count: 4,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0]),
    };

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0, 2])]]),
    );

    expect(result.buffer).toEqual(new Float64Array([2.0, 4.0]));
    expect(result.places.get("p1")?.count).toBe(2);
    expect(result.places.get("p1")?.offset).toBe(0);
  });

  it("removes tokens from a place with multi-dimensional tokens", () => {
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
            dimensions: 3,
          },
        ],
      ]),
      transitions: new Map(),
      // 3 tokens with 3 dimensions each: [1,2,3], [4,5,6], [7,8,9]
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]),
    };

    // Remove token at index 1 (middle token: [4,5,6])
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([1])]]),
    );

    expect(result.buffer).toEqual(
      new Float64Array([1.0, 2.0, 3.0, 7.0, 8.0, 9.0]),
    );
    expect(result.places.get("p1")?.count).toBe(2);
    expect(result.places.get("p1")?.offset).toBe(0);
  });

  it("adjusts offsets for subsequent places after removal", () => {
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
            count: 2,
            dimensions: 2,
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
            offset: 4, // After p1's 2 tokens * 2 dimensions
            count: 3,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      // p1: [1,2], [3,4]  |  p2: [5], [6], [7]
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]),
    };

    // Remove one token from p1
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0])]]),
    );

    // Expected: p1: [3,4]  |  p2: [5], [6], [7]
    expect(result.buffer).toEqual(new Float64Array([3.0, 4.0, 5.0, 6.0, 7.0]));
    expect(result.places.get("p1")?.count).toBe(1);
    expect(result.places.get("p1")?.offset).toBe(0);
    // p2's offset should be adjusted from 4 to 2 (removed 2 elements)
    expect(result.places.get("p2")?.offset).toBe(2);
    expect(result.places.get("p2")?.count).toBe(3);
  });

  it("removes all tokens from a place", () => {
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
            count: 2,
            dimensions: 1,
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
            offset: 2,
            count: 2,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0]),
    };

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0, 1])]]),
    );

    expect(result.buffer).toEqual(new Float64Array([3.0, 4.0]));
    expect(result.places.get("p1")?.count).toBe(0);
    expect(result.places.get("p1")?.offset).toBe(0);
    expect(result.places.get("p2")?.offset).toBe(0);
    expect(result.places.get("p2")?.count).toBe(2);
  });

  it("handles removal from middle place with three places", () => {
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
            count: 2,
            dimensions: 1,
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
            offset: 2,
            count: 3,
            dimensions: 1,
          },
        ],
        [
          "p3",
          {
            instance: {
              id: "p3",
              name: "Place 3",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 5,
            count: 2,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      // p1: [1, 2] | p2: [3, 4, 5] | p3: [6, 7]
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]),
    };

    // Remove one token from p2 (middle place)
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p2", new Set([1])]]),
    );

    // Expected: p1: [1, 2] | p2: [3, 5] | p3: [6, 7]
    expect(result.buffer).toEqual(
      new Float64Array([1.0, 2.0, 3.0, 5.0, 6.0, 7.0]),
    );
    expect(result.places.get("p1")?.offset).toBe(0);
    expect(result.places.get("p1")?.count).toBe(2);
    expect(result.places.get("p2")?.offset).toBe(2);
    expect(result.places.get("p2")?.count).toBe(2);
    // p3's offset should be adjusted from 5 to 4 (removed 1 element)
    expect(result.places.get("p3")?.offset).toBe(4);
    expect(result.places.get("p3")?.count).toBe(2);
  });

  it("removes tokens from multiple places simultaneously", () => {
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
            dimensions: 1,
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
            offset: 3,
            count: 2,
            dimensions: 2,
          },
        ],
        [
          "p3",
          {
            instance: {
              id: "p3",
              name: "Place 3",
              colorId: null,
              differentialEquationId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            },
            offset: 7,
            count: 2,
            dimensions: 1,
          },
        ],
      ]),
      transitions: new Map(),
      // p1: [1], [2], [3] | p2: [4,5], [6,7] | p3: [8], [9]
      buffer: new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]),
    };

    // Remove tokens from multiple places: token 1 from p1, token 0 from p2, token 1 from p3
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([
        ["p1", new Set([1])],
        ["p2", new Set([0])],
        ["p3", new Set([1])],
      ]),
    );

    // Expected: p1: [1], [3] | p2: [6,7] | p3: [8]
    expect(result.buffer).toEqual(new Float64Array([1.0, 3.0, 6.0, 7.0, 8.0]));
    expect(result.places.get("p1")?.count).toBe(2);
    expect(result.places.get("p1")?.offset).toBe(0);
    expect(result.places.get("p2")?.count).toBe(1);
    expect(result.places.get("p2")?.offset).toBe(2);
    expect(result.places.get("p3")?.count).toBe(1);
    expect(result.places.get("p3")?.offset).toBe(4);
  });
});
