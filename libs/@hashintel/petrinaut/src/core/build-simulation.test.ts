import { describe, expect, it } from "vitest";

import { buildSimulation } from "./build-simulation";
import type { SimulationInput } from "./types";

describe("buildSimulation", () => {
  it("builds a simulation with a single place and initial tokens", () => {
    const input: SimulationInput = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [
          {
            id: "p1",
            name: "Place 1",
            dimensions: 2,
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
        ],
        transitions: [],
      },
      initialMarking: new Map([
        [
          "p1",
          {
            values: new Float64Array([1.0, 2.0, 3.0, 4.0]),
            count: 2, // 2 tokens with 2 dimensions each
          },
        ],
      ]),
      seed: 42,
      dt: 0.1,
    };

    const frame = buildSimulation(input);

    // Verify simulation instance properties
    expect(frame.simulation.dt).toBe(0.1);
    expect(frame.simulation.rngState).toBe(42);
    expect(frame.simulation.currentFrameNumber).toBe(0);
    expect(frame.simulation.frames).toHaveLength(1);
    expect(frame.simulation.frames[0]).toBe(frame);

    // Verify initial frame properties
    expect(frame.time).toBe(0);
    expect(frame.places.size).toBe(1);
    expect(frame.transitions.size).toBe(0);

    // Verify place state
    const p1State = frame.places.get("p1");
    expect(p1State).toBeDefined();
    expect(p1State?.count).toBe(2);
    expect(p1State?.offset).toBe(0);
    expect(p1State?.instance.dimensions).toBe(2);

    // Verify buffer contains the correct token values
    expect(frame.buffer).toEqual(new Float64Array([1.0, 2.0, 3.0, 4.0]));

    // Verify compiled functions exist
    expect(frame.simulation.differentialEquationFns.has("p1")).toBe(true);
  });

  it("builds a simulation with multiple places, transitions, and proper buffer layout", () => {
    const input: SimulationInput = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [
          {
            id: "p1",
            name: "Place 1",
            dimensions: 1,
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0]); });",
          },
          {
            id: "p2",
            name: "Place 2",
            dimensions: 2,
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
          {
            id: "p3",
            name: "Place 3",
            dimensions: 1,
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0]); });",
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaCode:
              "export default Lambda((tokens) => { return 1.0; });",
            transitionKernelCode:
              "export default TransitionKernel((tokens) => { return [[[1.0, 2.0]]]; });",
          },
          {
            id: "t2",
            name: "Transition 2",
            inputArcs: [{ placeId: "p2", weight: 1 }],
            outputArcs: [{ placeId: "p3", weight: 1 }],
            lambdaCode:
              "export default Lambda((tokens) => { return 2.0; });",
            transitionKernelCode:
              "export default TransitionKernel((tokens) => { return [[[5.0]]]; });",
          },
        ],
      },
      initialMarking: new Map([
        [
          "p1",
          {
            values: new Float64Array([10.0, 20.0, 30.0]),
            count: 3, // 3 tokens with 1 dimension each
          },
        ],
        [
          "p2",
          {
            values: new Float64Array([1.0, 2.0]),
            count: 1, // 1 token with 2 dimensions
          },
        ],
        // p3 has no initial tokens
      ]),
      seed: 123,
      dt: 0.05,
    };

    const frame = buildSimulation(input);

    // Verify simulation instance properties
    expect(frame.simulation.dt).toBe(0.05);
    expect(frame.simulation.rngState).toBe(123);

    // Verify all places exist
    expect(frame.places.size).toBe(3);

    // Verify p1 state (places are sorted by ID, so p1 comes first)
    const p1State = frame.places.get("p1");
    expect(p1State?.count).toBe(3);
    expect(p1State?.offset).toBe(0);
    expect(p1State?.instance.dimensions).toBe(1);

    // Verify p2 state (comes after p1)
    const p2State = frame.places.get("p2");
    expect(p2State?.count).toBe(1);
    expect(p2State?.offset).toBe(3); // After p1's 3 tokens
    expect(p2State?.instance.dimensions).toBe(2);

    // Verify p3 state (comes after p2, has no tokens)
    const p3State = frame.places.get("p3");
    expect(p3State?.count).toBe(0);
    expect(p3State?.offset).toBe(5); // After p1's 3 values + p2's 2 values
    expect(p3State?.instance.dimensions).toBe(1);

    // Verify buffer layout: [p1: 10, 20, 30 | p2: 1, 2]
    expect(frame.buffer).toEqual(
      new Float64Array([10.0, 20.0, 30.0, 1.0, 2.0])
    );

    // Verify transitions exist with initial state
    expect(frame.transitions.size).toBe(2);
    expect(frame.transitions.get("t1")?.timeSinceLastFiring).toBe(0);
    expect(frame.transitions.get("t2")?.timeSinceLastFiring).toBe(0);

    // Verify all compiled functions exist
    expect(frame.simulation.differentialEquationFns.size).toBe(3);
    expect(frame.simulation.lambdaFns.size).toBe(2);
    expect(frame.simulation.transitionKernelFns.size).toBe(2);

    // Verify compiled functions are callable
    const lambdaFn = frame.simulation.lambdaFns.get("t1");
    expect(lambdaFn).toBeDefined();
    expect(typeof lambdaFn).toBe("function");

    const kernelFn = frame.simulation.transitionKernelFns.get("t2");
    expect(kernelFn).toBeDefined();
    expect(typeof kernelFn).toBe("function");
  });

  it("throws error when initialMarking references non-existent place", () => {
    const input: SimulationInput = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [
          {
            id: "p1",
            name: "Place 1",
            dimensions: 1,
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0]); });",
          },
        ],
        transitions: [],
      },
      initialMarking: new Map([
        [
          "p_nonexistent",
          {
            values: new Float64Array([1.0]),
            count: 1,
          },
        ],
      ]),
      seed: 42,
      dt: 0.1,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Place with ID p_nonexistent in initialMarking does not exist in SDCPN"
    );
  });

  it("throws error when token dimensions don't match place dimensions", () => {
    const input: SimulationInput = {
      sdcpn: {
        id: "test-sdcpn",
        title: "Test SDCPN",
        places: [
          {
            id: "p1",
            name: "Place 1",
            dimensions: 2, // Expects 2 dimensions per token
            differentialEquationCode:
              "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
        ],
        transitions: [],
      },
      initialMarking: new Map([
        [
          "p1",
          {
            values: new Float64Array([1.0, 2.0, 3.0]), // 3 values for 2 tokens = wrong
            count: 2, // 2 tokens × 2 dimensions = 4 values expected
          },
        ],
      ]),
      seed: 42,
      dt: 0.1,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Token dimension mismatch for place p1. Expected 4 values (2 dimensions × 2 tokens), got 3"
    );
  });
});
