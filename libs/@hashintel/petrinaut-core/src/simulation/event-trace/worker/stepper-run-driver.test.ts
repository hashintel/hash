import { describe, expect, it } from "vitest";

import { sirModel } from "../../../examples";
import { compileHirArtifacts } from "../../../hir/compile";
import { createMonteCarloSimulator } from "../../monte-carlo/monte-carlo-simulator";
import { ADAPTIVE_SIMULATOR_ID } from "./adaptive-stepper";
import { FIXED_STEP_SIMULATOR_ID } from "./fixed-step-stepper";
import { createStepperRunDriverFactory } from "./stepper-run-driver";

import type { SDCPN } from "../../../types/sdcpn";

const sir = sirModel.petriNetDefinition;
const sirConfig = {
  sdcpn: sir,
  hirArtifacts: compileHirArtifacts(sir).artifacts,
  initialMarking: Object.fromEntries(
    sir.places.map((place, index) => [place.id, index === 0 ? 50 : 3]),
  ),
  parameterValues: {},
  seed: 9,
  maxTime: 3,
  runCount: 6,
};

/** A source firing at rate 5 into `sink`. */
const poisson: SDCPN = {
  places: [
    {
      id: "sink",
      name: "Sink",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [{ placeId: "sink", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 5);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

describe("an experiment whose runs a stepper advances", () => {
  it("is the experiment the fixed-step engine computes, when the stepper is that engine's", () => {
    const dt = 0.05;
    const engine = createMonteCarloSimulator({ ...sirConfig, dt });
    const driven = createMonteCarloSimulator({
      ...sirConfig,
      dt,
      createRunDriver: createStepperRunDriverFactory({
        id: FIXED_STEP_SIMULATOR_ID,
        parameters: { dt },
      }),
    });

    for (let sample = 1; ; sample++) {
      const expected = engine.advanceAll();
      const actual = driven.advanceAll();
      expect(actual).toEqual(expected);
      for (let run = 0; run < sirConfig.runCount; run++) {
        const expectedRun = engine.getRunSnapshot(run);
        const actualRun = driven.getRunSnapshot(run);
        expect(actualRun.placeTokenCounts).toEqual(
          expectedRun.placeTokenCounts,
        );
        expect(actualRun.rngState).toBe(expectedRun.rngState);
        expect(actualRun.status).toBe(expectedRun.status);
      }
      if (expected.allFinished) {
        expect(sample).toBe(60);
        break;
      }
    }
  });

  it("samples a coarser grid than the stepper's step without changing the runs", () => {
    const fine = createMonteCarloSimulator({ ...sirConfig, dt: 0.05 });
    const coarse = createMonteCarloSimulator({
      ...sirConfig,
      // Sampled every 0.5 s, stepped every 0.05 s.
      dt: 0.5,
      createRunDriver: createStepperRunDriverFactory({
        id: FIXED_STEP_SIMULATOR_ID,
        parameters: { dt: 0.05 },
      }),
    });

    for (let sample = 1; sample <= 6; sample++) {
      for (let step = 0; step < 10; step++) {
        fine.advanceAll();
      }
      const result = coarse.advanceAll();
      for (let run = 0; run < sirConfig.runCount; run++) {
        expect(coarse.getRunSnapshot(run).placeTokenCounts).toEqual(
          fine.getRunSnapshot(run).placeTokenCounts,
        );
      }
      expect(result.allFinished).toBe(sample === 6);
    }
  });

  it("computes the adaptive simulator's runs to every sample time, the same way each time", () => {
    const create = () =>
      createMonteCarloSimulator({
        sdcpn: poisson,
        hirArtifacts: compileHirArtifacts(poisson).artifacts,
        initialMarking: { sink: 0 },
        parameterValues: {},
        seed: 4,
        dt: 0.25,
        maxTime: 2,
        runCount: 200,
        createRunDriver: createStepperRunDriverFactory({
          id: ADAPTIVE_SIMULATOR_ID,
          parameters: { tolerance: 1e-6 },
        }),
      });
    const counts = (simulator: ReturnType<typeof create>) =>
      Array.from(
        { length: 200 },
        (_, run) => simulator.getRunSnapshot(run).placeTokenCounts.sink ?? 0,
      );

    const first = create();
    const second = create();
    for (let sample = 1; sample <= 8; sample++) {
      const result = first.advanceAll();
      second.advanceAll();
      const arrived = counts(first);
      // The same stops give the same draws, so the same runs.
      expect(counts(second)).toEqual(arrived);
      // Arrivals at rate 5: a mean of 5t, within what 200 runs scatter.
      const mean = arrived.reduce((sum, count) => sum + count, 0) / 200;
      const expectedMean = 5 * sample * 0.25;
      expect(Math.abs(mean - expectedMean)).toBeLessThan(
        4 * Math.sqrt(expectedMean / 200),
      );
      expect(result.allFinished).toBe(sample === 8);
    }
    expect(first.getRunSummary(0).completionReason).toBe("maxTime");
  });
});
