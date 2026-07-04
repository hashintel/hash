import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { buildSimulation as buildSimulationRaw } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";
import { decodePlaceTokens } from "./token-layout.test-helpers";
import { parseUuid } from "./uuid";

import type { SDCPN } from "../../types/sdcpn";
import type { SimulationInput as SimulationInputForArtifacts } from "./types";

/** buildSimulation with HIR artifacts compiled from the input's SDCPN (the
 * engine no longer compiles user code itself). */
function buildSimulation(
  input: SimulationInputForArtifacts,
): ReturnType<typeof buildSimulationRaw> {
  return buildSimulationRaw({
    ...input,
    hirArtifacts:
      input.hirArtifacts ??
      compileHirArtifacts(input.sdcpn, input.extensions).artifacts,
  });
}

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

  it("preserves uuid lanes through dynamics, firing, compaction, and frame reads", () => {
    // The NaN-payload uuid would be corrupted by any accidental routing of
    // its lanes through a Float64Array (NaN canonicalization).
    const nanPayloadUuid = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    const otherUuid = "0f9a3b5c-7d1e-4a2b-8c3d-4e5f6a7b8c9d";

    const sdcpn: SDCPN = {
      types: [
        {
          id: "type1",
          name: "Type 1",
          iconSlug: "circle",
          displayColor: "#000000",
          elements: [
            { elementId: "elem1", name: "id", type: "uuid" },
            { elementId: "elem2", name: "x", type: "real" },
          ],
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
          name: "Source",
          colorId: "type1",
          dynamicsEnabled: true,
          differentialEquationId: "diffeq1",
          x: 0,
          y: 0,
        },
        {
          id: "p2",
          name: "Target",
          colorId: "type1",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t1",
          name: "Transition 1",
          inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "p2", weight: 1 }],
          lambdaType: "stochastic",
          lambdaCode:
            "export default Lambda((tokens, parameters) => { return Infinity; });",
          transitionKernelCode:
            // Forward the consumed token's uuid unchanged (bigint pass-through).
            "export default TransitionKernel((input, parameters) => { return { Target: [{ id: input.Source[0].id, x: input.Source[0].x }] }; });",
          x: 100,
          y: 0,
        },
      ],
    };

    // Initial marking supplies uuids as at-rest strings.
    const simulation = buildSimulation({
      sdcpn,
      initialMarking: {
        p1: [
          { id: nanPayloadUuid, x: 1.0 },
          { id: otherUuid, x: 2.0 },
        ],
      },
      parameterValues: {},
      seed: 42,
      dt: 0.1,
      maxTime: null,
    });

    // Marking pack round-trip before any stepping.
    expect(
      decodePlaceTokens(simulation.frameLayout, simulation.frames[0]!, "p1"),
    ).toEqual([
      { id: parseUuid(nanPayloadUuid), x: 1.0 },
      { id: parseUuid(otherUuid), x: 2.0 },
    ]);

    // Step until the transition fires: each step integrates dynamics and
    // copies the frame; the firing step consumes one token (removal +
    // compaction). Elapsed time is 0 on the first step, so the Infinity-rate
    // transition fires on the second.
    let result = computeNextFrame(simulation);
    result = computeNextFrame(result.simulation);
    expect(result.transitionFired).toBe(true);

    const lastFrame =
      result.simulation.frames[result.simulation.currentFrameNumber]!;
    const sourceTokens = decodePlaceTokens(
      result.simulation.frameLayout,
      lastFrame,
      "p1",
    );
    const targetTokens = decodePlaceTokens(
      result.simulation.frameLayout,
      lastFrame,
      "p2",
    );

    expect(sourceTokens).toHaveLength(1);
    expect(targetTokens).toHaveLength(1);

    // Both uuids survive intact, whichever token was consumed.
    const survivingIds = [sourceTokens[0]!.id, targetTokens[0]!.id];
    expect(survivingIds).toContain(parseUuid(nanPayloadUuid));
    expect(survivingIds).toContain(parseUuid(otherUuid));

    // Dynamics only touched the real field on the remaining source token.
    expect(sourceTokens[0]!.x).toBeTypeOf("number");
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
