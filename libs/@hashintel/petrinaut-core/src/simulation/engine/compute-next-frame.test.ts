import { describe, expect, it } from "vitest";

import { buildSimulation } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";
import { decodePlaceTokens } from "./token-layout.test-helpers";

import type { SDCPN } from "../../types/sdcpn";

describe("computeNextFrame", () => {
  it("should compute next frame with dynamics and transitions", () => {
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
          inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
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

    const initialMarking = { p1: [{ x: 10.0, y: 20.0 }] };

    // Build the simulation
    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN the simulation should have 2 frames now
    expect(result.simulation.frames).toHaveLength(2);
    expect(result.simulation.currentFrameNumber).toBe(1);
    // No transition should have fired (low probability)
    expect(result.transitionFired).toBe(false);

    // The run controller should advance time by dt.
    expect(result.simulation.currentTime).toBe(0.1);

    // The tokens should reflect dynamics (values should have increased by derivative * dt)
    // Initial: { x: 10, y: 20 }, derivative: { x: 1, y: 1 }, dt: 0.1
    // Expected after dynamics: { x: 10.1, y: 20.1 }
    const tokens = decodePlaceTokens(
      result.simulation.frameLayout,
      result.simulation.frames[1]!,
      "p1",
    );
    expect(tokens).toEqual([
      { x: expect.closeTo(10.1) as number, y: expect.closeTo(20.1) as number },
    ]);
  });

  it("should skip dynamics for places without type", () => {
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

    const initialMarking = { p1: 0 };

    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN it should complete without error
    expect(result.simulation.frames).toHaveLength(2);
    expect(result.transitionFired).toBe(false);
  });

  it("should skip dynamics for places with dynamics disabled", () => {
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

    const initialMarking = { p1: [{ x: 10.0 }] };

    const simulation = buildSimulation({
      sdcpn,
      initialMarking,
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    // WHEN computing the next frame
    const result = computeNextFrame(simulation);

    // THEN the tokens should be unchanged (no dynamics applied)
    const tokens = decodePlaceTokens(
      result.simulation.frameLayout,
      result.simulation.frames[1]!,
      "p1",
    );
    expect(tokens).toEqual([{ x: 10.0 }]);
    expect(result.transitionFired).toBe(false);
  });
});
