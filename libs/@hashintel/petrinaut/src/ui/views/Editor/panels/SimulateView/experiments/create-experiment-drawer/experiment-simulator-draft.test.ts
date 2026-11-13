import { describe, expect, it } from "vitest";

import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  FIXED_STEP_SIMULATOR_ID,
  type SimulatorRegistration,
} from "@hashintel/petrinaut-core";

import {
  EMPTY_EXPERIMENT_SIMULATOR,
  resolveExperimentSimulator,
  experimentSimulatorError,
  withSimulatorParameter,
  type SimulatorRefusals,
} from "./experiment-simulator-draft";

import type { SimulatorsContextValue } from "../../../../../../../react/simulators/context";

const neverStarted = () => {
  throw new Error("Nothing starts here");
};
const workers = {
  createRunWorker: neverStarted,
  createExperimentWorker: neverStarted,
};
const fixedStep = createJsFixedStepSimulator(workers) as SimulatorRegistration;
const adaptive = createJsAdaptiveSimulator(workers) as SimulatorRegistration;
const webGpu = createWebGpuFixedStepSimulator({
  loadBackend: neverStarted,
}) as SimulatorRegistration;

const simulators: SimulatorsContextValue = {
  registrations: [fixedStep, adaptive, webGpu],
  defaultSelections: {
    quick: { simulatorId: FIXED_STEP_SIMULATOR_ID },
    stochastic: {
      simulatorId: FIXED_STEP_SIMULATOR_ID,
      parameters: { dt: 0.1 },
    },
  },
};
const none: SimulatorRefusals = new Map();

describe("resolveExperimentSimulator", () => {
  it("stands on the default simulator with the default selection's values", () => {
    const resolved = resolveExperimentSimulator(
      EMPTY_EXPERIMENT_SIMULATOR,
      simulators,
      none,
    );
    expect(resolved.registration).toBe(fixedStep);
    expect(resolved.selection).toEqual({
      simulatorId: "js-fixed-step",
      parameters: { dt: 0.1 },
    });
    // Sampled at the time step: the Sample every field is not read.
    expect(resolved.timeStep).toBe(0.1);
    expect(resolved.samplePeriod).toBe(0.1);
  });

  it("samples a simulator without a time step at the field's value", () => {
    const resolved = resolveExperimentSimulator(
      {
        ...EMPTY_EXPERIMENT_SIMULATOR,
        simulatorId: "js-adaptive",
        samplePeriod: "0.25",
      },
      simulators,
      none,
    );
    expect(resolved.registration).toBe(adaptive);
    expect(resolved.selection).toEqual({
      simulatorId: "js-adaptive",
      parameters: {},
    });
    expect(resolved.timeStep).toBeNull();
    expect(resolved.samplePeriod).toBe(0.25);
  });

  it("samples a fixed-step simulator at its own default step when nothing was typed", () => {
    const resolved = resolveExperimentSimulator(
      { ...EMPTY_EXPERIMENT_SIMULATOR, simulatorId: "webgpu-fixed-step" },
      simulators,
      none,
    );
    expect(resolved.selection).toEqual({
      simulatorId: "webgpu-fixed-step",
      parameters: {},
    });
    expect(resolved.samplePeriod).toBe(0.1);
  });

  it("returns to the default while the picked simulator is refused, keeping the pick", () => {
    const draft = {
      ...EMPTY_EXPERIMENT_SIMULATOR,
      simulatorId: "webgpu-fixed-step",
    };
    const refused = resolveExperimentSimulator(
      draft,
      simulators,
      new Map([
        ["webgpu-fixed-step", { reason: "Coloured places", pending: false }],
      ]),
    );
    expect(refused.registration).toBe(fixedStep);
    // The pick stands once the refusal is lifted.
    expect(
      resolveExperimentSimulator(draft, simulators, none).registration,
    ).toBe(webGpu);
  });

  it("takes the first simulator that can run when the default cannot", () => {
    const resolved = resolveExperimentSimulator(
      EMPTY_EXPERIMENT_SIMULATOR,
      simulators,
      new Map([["js-fixed-step", { reason: "Gone", pending: false }]]),
    );
    expect(resolved.registration).toBe(adaptive);
  });

  it("samples every step on a clock of steps, whichever simulator and whatever the field holds", () => {
    for (const simulatorId of ["js-fixed-step", "js-adaptive"]) {
      const resolved = resolveExperimentSimulator(
        { ...EMPTY_EXPERIMENT_SIMULATOR, simulatorId, samplePeriod: "0.25" },
        simulators,
        none,
        "steps",
      );
      expect(resolved.registration?.id).toBe(simulatorId);
      expect(resolved.clock).toBe("steps");
      // Held to a step: the Sample every field is not read, and an empty
      // one is no error.
      expect(resolved.timeStep).toBe(1);
      expect(resolved.samplePeriod).toBe(1);
    }
    expect(
      experimentSimulatorError(
        resolveExperimentSimulator(
          {
            ...EMPTY_EXPERIMENT_SIMULATOR,
            simulatorId: "js-adaptive",
            samplePeriod: "",
          },
          simulators,
          none,
          "steps",
        ),
      ),
    ).toBeNull();
  });

  it("resolves to no simulator, and says so, when none is registered", () => {
    const resolved = resolveExperimentSimulator(
      EMPTY_EXPERIMENT_SIMULATOR,
      { ...simulators, registrations: [] },
      none,
    );
    expect(resolved.selection).toBeNull();
    expect(experimentSimulatorError(resolved)).toBe(
      "No simulator can run this experiment",
    );
  });
});

describe("withSimulatorParameter", () => {
  it("stores a value the spec accepts under its simulator", () => {
    const draft = withSimulatorParameter(
      EMPTY_EXPERIMENT_SIMULATOR,
      fixedStep,
      { dt: 0.1 },
      "dt",
      0.02,
    );
    expect(draft.parametersBySimulator).toEqual({
      "js-fixed-step": { dt: 0.02 },
    });
    expect(
      resolveExperimentSimulator(draft, simulators, none).samplePeriod,
    ).toBe(0.02);
  });

  it("does not store a value the spec rejects", () => {
    expect(
      withSimulatorParameter(
        EMPTY_EXPERIMENT_SIMULATOR,
        fixedStep,
        { dt: 0.1 },
        "dt",
        0,
      ),
    ).toBe(EMPTY_EXPERIMENT_SIMULATOR);
  });
});

describe("experimentSimulatorError", () => {
  it("asks for a positive spacing from a simulator that has no time step", () => {
    const resolve = (samplePeriod: string) =>
      resolveExperimentSimulator(
        {
          ...EMPTY_EXPERIMENT_SIMULATOR,
          simulatorId: "js-adaptive",
          samplePeriod,
        },
        simulators,
        none,
      );
    expect(experimentSimulatorError(resolve("0.5"))).toBeNull();
    expect(experimentSimulatorError(resolve("0"))).toBe(
      "Sample every must be a positive number",
    );
    expect(experimentSimulatorError(resolve(""))).toBe(
      "Sample every must be a positive number",
    );
  });
});
