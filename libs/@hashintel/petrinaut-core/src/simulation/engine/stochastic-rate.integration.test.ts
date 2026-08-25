import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { buildSimulation } from "./build-simulation";
import { computeNextFrame } from "./compute-next-frame";

import type { SDCPN } from "../../types/sdcpn";

describe("stochastic firing through the full frame loop", () => {
  it("fires a source transition at its configured rate across frames", () => {
    const sdcpn: SDCPN = {
      places: [
        {
          id: "p_sink",
          name: "Sink",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t_source",
          name: "Source",
          inputArcs: [],
          outputArcs: [{ placeId: "p_sink", weight: 1 }],
          lambdaType: "stochastic",
          lambdaCode: "export default Lambda((input, parameters) => 0.213);",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [],
      differentialEquations: [],
      parameters: [],
    };
    const { artifacts, failures } = compileHirArtifacts(sdcpn);
    expect(failures).toEqual([]);
    let simulation = buildSimulation({
      sdcpn,
      initialMarking: {},
      parameterValues: {},
      seed: 7,
      dt: 0.1,
      maxTime: null,
      hirArtifacts: artifacts,
    });
    let fires = 0;
    for (let i = 0; i < 10000; i++) {
      const result = computeNextFrame(simulation);
      simulation = result.simulation;
      if (result.transitionFired) fires++;
      // keep memory flat like the run loop does
      simulation = {
        ...simulation,
        frames: [simulation.frames[simulation.currentFrameNumber]!],
        currentFrameNumber: 0,
      };
    }
    // Binomial(10000, 1 - e^(-0.0213)) ≈ 211 ± 14.4; 4 standard deviations.
    const expected = 10000 * (1 - Math.exp(-0.0213));
    expect(Math.abs(fires - expected)).toBeLessThanOrEqual(
      4 * Math.sqrt(expected * (1 - 0.0213)),
    );
  });
});
