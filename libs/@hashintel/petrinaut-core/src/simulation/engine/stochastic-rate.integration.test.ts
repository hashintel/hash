import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { readEngineFrame } from "../frames/internal-frame";
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

  it("fires at a rate that reads its input place's token count", () => {
    // Pure death, X -> nothing at mu * X: each token leaves at rate mu, so
    // E[X(t)] = X0 * e^(-mu * t). A rate that ignored the count would fire
    // about mu * t = 1 time instead of removing ~63% of the tokens.
    const sdcpn: SDCPN = {
      places: [
        {
          id: "p_x",
          name: "X",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t_death",
          name: "Death",
          inputArcs: [{ placeId: "p_x", weight: 1, type: "standard" }],
          outputArcs: [],
          lambdaType: "stochastic",
          lambdaCode: "return parameters.mu * input.X.count;",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [],
      differentialEquations: [],
      parameters: [
        {
          id: "param_mu",
          name: "mu",
          variableName: "mu",
          type: "real",
          defaultValue: "0.5",
        },
      ],
    };
    const { artifacts, failures } = compileHirArtifacts(sdcpn);
    expect(failures).toEqual([]);

    const initialCount = 40;
    const runs = 50;
    // dt keeps mu * X * dt ≤ 0.02, so the one-firing-per-step ceiling biases
    // the rate by about 1%.
    const dt = 0.001;
    const steps = 2000;
    let total = 0;
    for (let seed = 1; seed <= runs; seed++) {
      let simulation = buildSimulation({
        sdcpn,
        initialMarking: { p_x: initialCount },
        parameterValues: { mu: "0.5" },
        seed,
        dt,
        maxTime: null,
        hirArtifacts: artifacts,
      });
      for (let step = 0; step < steps; step++) {
        simulation = computeNextFrame(simulation).simulation;
        simulation = {
          ...simulation,
          frames: [simulation.frames[simulation.currentFrameNumber]!],
          currentFrameNumber: 0,
        };
      }
      total +=
        readEngineFrame(
          simulation.frameLayout,
          simulation.frames[0]!,
        ).getPlaceState("p_x")?.count ?? 0;
    }

    // Mean of 50 Binomial(40, e^-1) runs: 14.7 ± 0.43; allow 4 standard
    // deviations plus the discretisation bias.
    const expected = initialCount * Math.exp(-0.5 * dt * steps);
    expect(Math.abs(total / runs - expected)).toBeLessThanOrEqual(2);
  });
});
