import { describe, expect, it } from "vitest";

import type { SDCPN } from "../types/sdcpn";
import { buildSimulation } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";

describe("computeNextFrame", () => {
  it("should compute next frame with dynamics and transitions", () => {
    // GIVEN a simple SDCPN with one place and one transition
    const sdcpn: SDCPN = {
      id: "test-sdcpn",
      title: "Test SDCPN",
      types: [
        {
          id: "type1",
          name: "Type 1",
          iconId: "circle",
          colorCode: "#000000",
          elements: [
            { id: "elem1", name: "x", type: "real" },
            { id: "elem2", name: "y", type: "real" },
          ],
        },
      ],
      differentialEquations: [
        {
          id: "diffeq1",
          name: "Differential Equation 1",
          typeId: "type1",
          code: "export default Dynamics((tokens, parameters) => { return tokens.map(token => ({ x: 1, y: 1 })); });",
        },
      ],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          type: "type1",
          dynamicsEnabled: true,
          differentialEquationCode: { refId: "diffeq1" },
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
    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    // WHEN computing the next frame
    const updatedSimulation = computeNextFrame(simulation);

    // THEN the simulation should have 2 frames now
    expect(updatedSimulation.frames).toHaveLength(2);
    expect(updatedSimulation.currentFrameNumber).toBe(1);

    // The new frame should have time = dt
    const nextFrame = updatedSimulation.frames[1]!;
    expect(nextFrame.time).toBe(0.1);

    // The buffer should reflect dynamics (values should have increased by derivative * dt)
    // Initial: [10, 20], derivative: [1, 1], dt: 0.1
    // Expected after dynamics: [10.1, 20.1]
    expect(nextFrame.buffer[0]).toBeCloseTo(10.1);
    expect(nextFrame.buffer[1]).toBeCloseTo(20.1);
  });

  it("should skip dynamics for places without type", () => {
    // GIVEN a place without a type
    const sdcpn: SDCPN = {
      id: "test-sdcpn",
      title: "Test SDCPN",
      types: [],
      differentialEquations: [],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          type: null,
          dynamicsEnabled: true,
          differentialEquationCode: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    };

    const initialMarking = new Map([
      ["p1", { values: new Float64Array([]), count: 0 }],
    ]);

    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    // WHEN computing the next frame
    const updatedSimulation = computeNextFrame(simulation);

    // THEN it should complete without error
    expect(updatedSimulation.frames).toHaveLength(2);
  });

  it("should skip dynamics for places with dynamics disabled", () => {
    // GIVEN a place with dynamics disabled
    const sdcpn: SDCPN = {
      id: "test-sdcpn",
      title: "Test SDCPN",
      types: [
        {
          id: "type1",
          name: "Type 1",
          iconId: "circle",
          colorCode: "#000000",
          elements: [{ id: "elem1", name: "x", type: "real" }],
        },
      ],
      differentialEquations: [
        {
          id: "diffeq1",
          name: "Differential Equation 1",
          typeId: "type1",
          code: "export default Dynamics((tokens, parameters) => { return tokens.map(token => ({ x: 1 })); });",
        },
      ],
      parameters: [],
      places: [
        {
          id: "p1",
          name: "Place1",
          type: "type1",
          dynamicsEnabled: false,
          differentialEquationCode: { refId: "diffeq1" },
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    };

    const initialMarking = new Map([
      ["p1", { values: new Float64Array([10.0]), count: 1 }],
    ]);

    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      seed: 42,
      dt: 0.1,
    });

    // WHEN computing the next frame
    const updatedSimulation = computeNextFrame(simulation);

    // THEN the buffer should be unchanged (no dynamics applied)
    const nextFrame = updatedSimulation.frames[1]!;
    expect(nextFrame.buffer[0]).toBe(10.0);
  });
});
