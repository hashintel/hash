import { describe, expect, it } from "vitest";

import type { SimulationInput } from "./types";
import { buildSimulation } from "./build-simulation";

describe("buildSimulation", () => {
  it("builds a simulation with a single place and initial tokens", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
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
      parameterValues: {},
      seed: 42,
      dt: 0.1,
    };

    const simulationInstance = buildSimulation(input);
    const frame = simulationInstance.frames[0]!;

    // Verify simulation instance properties
    expect(simulationInstance.dt).toBe(0.1);
    expect(simulationInstance.rngState).toBe(42);
    expect(simulationInstance.currentFrameNumber).toBe(0);
    expect(simulationInstance.frames).toHaveLength(1);
    expect(simulationInstance.frames[0]).toBe(frame);

    // Verify initial frame properties
    expect(frame.time).toBe(0);
    expect(frame.places.size).toBe(1);
    expect(frame.transitions.size).toBe(0);

    // Verify place state
    const p1State = frame.places.get("p1");
    expect(p1State).toBeDefined();
    expect(p1State?.count).toBe(2);
    expect(p1State?.offset).toBe(0);
    const p1Type = simulationInstance.places.get("p1")?.colorId;
    expect(p1Type).toBe("type1");
    const typeDefinition = input.sdcpn.types.find((tp) => tp.id === p1Type);
    expect(typeDefinition?.elements.length).toBe(2);

    // Verify buffer contains the correct token values
    expect(frame.buffer).toEqual(new Float64Array([1.0, 2.0, 3.0, 4.0]));

    // Verify compiled functions exist
    expect(simulationInstance.differentialEquationFns.has("p1")).toBe(true);
  });

  it("builds a simulation with multiple places, transitions, and proper buffer layout", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
          {
            id: "type2",
            name: "Type 2",
            iconSlug: "square",
            displayColor: "#00FF00",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((placeValues, t) => { return new Float64Array([0]); });",
          },
          {
            id: "diffeq2",
            name: "Differential Equation 2",
            colorId: "type2",
            code: "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
          },
          {
            id: "p2",
            name: "Place 2",
            colorId: "type2",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq2",
            x: 100,
            y: 0,
          },
          {
            id: "p3",
            name: "Place 3",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 200,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "t1",
            name: "Transition 1",
            inputArcs: [{ placeId: "p1", weight: 1 }],
            outputArcs: [{ placeId: "p2", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "export default Lambda((tokens) => { return 1.0; });",
            transitionKernelCode:
              "export default TransitionKernel((tokens) => { return [[[1.0, 2.0]]]; });",
            x: 50,
            y: 0,
          },
          {
            id: "t2",
            name: "Transition 2",
            inputArcs: [{ placeId: "p2", weight: 1 }],
            outputArcs: [{ placeId: "p3", weight: 1 }],
            lambdaType: "stochastic",
            lambdaCode: "export default Lambda((tokens) => { return 2.0; });",
            transitionKernelCode:
              "export default TransitionKernel((tokens) => { return [[[5.0]]]; });",
            x: 150,
            y: 0,
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
      parameterValues: {},
      seed: 123,
      dt: 0.05,
    };

    const simulationInstance = buildSimulation(input);
    const frame = simulationInstance.frames[0]!;

    // Verify simulation instance properties
    expect(simulationInstance.dt).toBe(0.05);
    expect(simulationInstance.rngState).toBe(123);

    // Verify all places exist
    expect(frame.places.size).toBe(3);

    // Verify p1 state (places are sorted by ID, so p1 comes first)
    const p1State = frame.places.get("p1");
    expect(p1State?.count).toBe(3);
    expect(p1State?.offset).toBe(0);
    const p1Type = simulationInstance.places.get("p1")?.colorId;
    expect(p1Type).toBe("type1");
    const p1TypeDef = input.sdcpn.types.find((tp) => tp.id === p1Type);
    expect(p1TypeDef?.elements.length).toBe(1);

    // Verify p2 state (comes after p1)
    const p2State = frame.places.get("p2");
    expect(p2State?.count).toBe(1);
    expect(p2State?.offset).toBe(3); // After p1's 3 tokens
    const p2Type = simulationInstance.places.get("p2")?.colorId;
    expect(p2Type).toBe("type2");
    const p2TypeDef = input.sdcpn.types.find((tp) => tp.id === p2Type);
    expect(p2TypeDef?.elements.length).toBe(2);

    // Verify p3 state (comes after p2, has no tokens)
    const p3State = frame.places.get("p3");
    expect(p3State?.count).toBe(0);
    expect(p3State?.offset).toBe(5); // After p1's 3 values + p2's 2 values
    const p3Type = simulationInstance.places.get("p3")?.colorId;
    expect(p3Type).toBe("type1");
    const p3TypeDef = input.sdcpn.types.find((tp) => tp.id === p3Type);
    expect(p3TypeDef?.elements.length).toBe(1);

    // Verify buffer layout: [p1: 10, 20, 30 | p2: 1, 2]
    expect(frame.buffer).toEqual(
      new Float64Array([10.0, 20.0, 30.0, 1.0, 2.0]),
    );

    // Verify transitions exist with initial state
    expect(frame.transitions.size).toBe(2);
    expect(frame.transitions.get("t1")?.timeSinceLastFiring).toBe(0);
    expect(frame.transitions.get("t2")?.timeSinceLastFiring).toBe(0);

    // Verify all compiled functions exist
    expect(simulationInstance.differentialEquationFns.size).toBe(3);
    expect(simulationInstance.lambdaFns.size).toBe(2);
    expect(simulationInstance.transitionKernelFns.size).toBe(2);

    // Verify compiled functions are callable
    const lambdaFn = simulationInstance.lambdaFns.get("t1");
    expect(lambdaFn).toBeDefined();
    expect(typeof lambdaFn).toBe("function");

    const kernelFn = simulationInstance.transitionKernelFns.get("t2");
    expect(kernelFn).toBeDefined();
    expect(typeof kernelFn).toBe("function");
  });

  it("throws error when initialMarking references non-existent place", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [{ elementId: "e1", name: "x", type: "real" }],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((placeValues, t) => { return new Float64Array([0]); });",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1",
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
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
      parameterValues: {},
      seed: 42,
      dt: 0.1,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Place with ID p_nonexistent in initialMarking does not exist in SDCPN",
    );
  });

  it("throws error when token dimensions don't match place dimensions", () => {
    const input: SimulationInput = {
      sdcpn: {
        types: [
          {
            id: "type1",
            name: "Type 1",
            iconSlug: "circle",
            displayColor: "#FF0000",
            elements: [
              { elementId: "e1", name: "x", type: "real" },
              { elementId: "e2", name: "y", type: "real" },
            ],
          },
        ],
        differentialEquations: [
          {
            id: "diffeq1",
            name: "Differential Equation 1",
            colorId: "type1",
            code: "export default Dynamics((placeValues, t) => { return new Float64Array([0, 0]); });",
          },
        ],
        parameters: [],
        places: [
          {
            id: "p1",
            name: "Place 1",
            colorId: "type1", // Type has 2 dimensions
            dynamicsEnabled: true,
            differentialEquationId: "diffeq1",
            x: 0,
            y: 0,
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
      parameterValues: {},
      seed: 42,
      dt: 0.1,
    };

    expect(() => buildSimulation(input)).toThrow(
      "Token dimension mismatch for place p1. Expected 4 values (2 dimensions × 2 tokens), got 3",
    );
  });
});
