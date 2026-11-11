import { describe, expect, it } from "vitest";

import { sirModel } from "../../../examples";
import { compileHirArtifacts } from "../../../hir/compile";
import { createMonteCarloSimulator } from "../../monte-carlo/monte-carlo-simulator";
import { ADAPTIVE_SIMULATOR_ID } from "./adaptive-stepper";
import { FIXED_STEP_SIMULATOR_ID } from "./fixed-step-stepper";
import { createRunStepper, createStepper } from "./steppers";

import type { RunStepperConfig } from "./run-stepper";

const sdcpn = sirModel.petriNetDefinition;
const config: RunStepperConfig = {
  sdcpn,
  hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
  initialMarking: Object.fromEntries(
    sdcpn.places.map((place, index) => [place.id, index === 0 ? 40 : 2]),
  ),
  parameterValues: {},
  seed: 11,
  maxTime: 3,
};

describe("createStepper", () => {
  it("builds the stepper of the selected simulator", () => {
    const fixed = createStepper(
      { id: FIXED_STEP_SIMULATOR_ID, parameters: { dt: 0.05 } },
      config,
    );
    fixed.advance(0.05);
    expect(fixed.time).toBeCloseTo(0.05, 12);

    const adaptive = createStepper(
      { id: ADAPTIVE_SIMULATOR_ID, parameters: { tolerance: 1e-6 } },
      config,
    );
    expect(adaptive.diagnostics?.()).toHaveProperty("solverError");
  });

  it("names a simulator it does not host and a parameter its stepper rejects", () => {
    expect(() =>
      createStepper({ id: "webgpu-fixed-step", parameters: {} }, config),
    ).toThrow(
      'Simulator "webgpu-fixed-step" has no stepper in the event simulation worker',
    );
    expect(() =>
      createStepper({ id: FIXED_STEP_SIMULATOR_ID, parameters: {} }, config),
    ).toThrow(
      'Simulator "js-fixed-step" parameter "dt" should be a number above 0, received undefined',
    );
    expect(() =>
      createStepper(
        { id: ADAPTIVE_SIMULATOR_ID, parameters: { tolerance: 0 } },
        config,
      ),
    ).toThrow(
      'Simulator "js-adaptive" parameter "tolerance" should be a number above 0, received 0',
    );
  });
});

describe("the fixed-step stepper and an experiment", () => {
  it("steps run k of an experiment when given run index k", () => {
    const dt = 0.05;
    const runCount = 4;
    const experiment = createMonteCarloSimulator({
      ...config,
      maxTime: 3,
      dt,
      runCount,
    });
    const steppers = Array.from({ length: runCount }, (_, runIndex) =>
      createStepper(
        { id: FIXED_STEP_SIMULATOR_ID, parameters: { dt } },
        { ...config, runIndex },
      ),
    );

    for (let sample = 1; ; sample++) {
      const result = experiment.advanceAll();
      for (const [runIndex, stepper] of steppers.entries()) {
        // To the sample time, whatever states are worth keeping on the way.
        while (
          stepper.advance(sample * dt).kind !== "stopped" &&
          stepper.run.completionReason === null
        ) {
          // Keep advancing.
        }
        const expected = experiment.getRunSnapshot(runIndex);
        const { placeIds } = stepper.run.simulation.frameLayout;
        expect(
          Object.fromEntries(
            placeIds.map((placeId, placeIndex) => [
              placeId,
              stepper.run.currentFrame.placeCounts[placeIndex],
            ]),
          ),
        ).toEqual(expected.placeTokenCounts);
        expect(stepper.run.rngState).toBe(expected.rngState);
      }
      if (result.allFinished) {
        expect(sample).toBe(60);
        break;
      }
    }
  });
});

describe("createRunStepper", () => {
  const adaptive = {
    id: ADAPTIVE_SIMULATOR_ID,
    parameters: { tolerance: 1e-6 },
  };

  it("steps a timed net with the selected simulator", () => {
    const stepper = createRunStepper(adaptive, config);
    expect(stepper.diagnostics?.()).toHaveProperty("solverError");
  });

  it("steps an untimed net by steps, whichever simulator is selected", () => {
    const untimed: RunStepperConfig["sdcpn"] = {
      ...sdcpn,
      places: sdcpn.places.map((place) => ({
        ...place,
        dynamicsEnabled: false,
      })),
      transitions: sdcpn.transitions.map((transition) => ({
        ...transition,
        lambdaType: "predicate" as const,
        lambdaCode: "",
      })),
    };
    for (const selection of [
      adaptive,
      { id: FIXED_STEP_SIMULATOR_ID, parameters: { dt: 0.05 } },
    ]) {
      const stepper = createRunStepper(selection, {
        ...config,
        sdcpn: untimed,
        hirArtifacts: compileHirArtifacts(untimed).artifacts,
      });
      // The step stepper publishes nothing about itself.
      expect("diagnostics" in stepper).toBe(false);
      expect(stepper.advance()).toMatchObject({ kind: "firing", time: 1 });
      expect(stepper.advance()).toMatchObject({ kind: "firing", time: 2 });
    }
  });
});
