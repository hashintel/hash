import { describe, expect, it, vi } from "vitest";

import { simulatorFromExperimentBackend } from "./experiment-backend-simulator";
import { assessSimulator, defineSimulator } from "./simulator";

import type { ExperimentBackend } from "../../experiments/experiment-backend";
import type { ExperimentRequest } from "../../experiments/experiment-request";
import type { SDCPN } from "../../types/sdcpn";
import type { MonteCarloExperiment } from "../monte-carlo/runtime/experiment";
import type { SimulatorParameterSpecs } from "./parameters";
import type { SimulationRequest, SimulationRequestBase } from "./simulator";

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const requestBase: SimulationRequestBase = {
  sdcpn: emptyNet,
  initialMarking: {},
  parameterValues: {},
  seed: 1,
  maxTime: 10,
};

const stepParameters = {
  dt: {
    type: "number",
    label: "Time step",
    default: 0.1,
    min: 0,
    exclusiveMin: true,
  },
} as const satisfies SimulatorParameterSpecs;

const manifest = {
  id: "test.stepper",
  label: "Test stepper",
  description: "For tests.",
  parameters: stepParameters,
  produces: { run: false, experiment: true },
} as const;

describe("defineSimulator", () => {
  it("rejects an enum parameter whose default is not one of its options", () => {
    expect(() =>
      defineSimulator(
        {
          ...manifest,
          parameters: {
            method: {
              type: "enum",
              label: "Method",
              options: [{ value: "euler", label: "Euler" }],
              default: "rk4",
            },
          },
        },
        {
          isAvailable: () => true,
          load: () => Promise.reject(new Error("never loaded")),
        },
      ),
    ).toThrow(
      'Simulator "test.stepper" parameter "method" defaults to "rk4", which is not one of its options',
    );
  });
});

describe("assessSimulator", () => {
  const offering = (
    assess: (request: SimulationRequest<typeof stepParameters>) => void,
    isAvailable = true,
  ) =>
    defineSimulator(manifest, {
      isAvailable: () => isAvailable,
      load: () =>
        Promise.resolve({
          needsHirTrees: false,
          assess: (request) => {
            assess(request);
            return Promise.resolve({ eligible: true, notes: [] });
          },
        }),
    });

  it("hands the simulator the parameters resolved against its spec", async () => {
    const assess = vi.fn();
    const outcome = await assessSimulator(
      offering(assess),
      { dt: 0.5, unknown: true },
      requestBase,
    );
    expect(outcome.ok).toBe(true);
    expect(assess).toHaveBeenCalledWith({
      ...requestBase,
      simulatorParameters: { dt: 0.5 },
    });
  });

  it("refuses a simulator the environment cannot run, without loading it", async () => {
    const assess = vi.fn();
    const outcome = await assessSimulator(
      offering(assess, false),
      {},
      requestBase,
    );
    expect(outcome).toMatchObject({
      ok: false,
      blockers: [{ code: "simulator-unavailable", origin: "environment" }],
    });
    expect(assess).not.toHaveBeenCalled();
  });

  it("refuses a parameter its spec rejects, naming the parameter", async () => {
    const assess = vi.fn();
    const outcome = await assessSimulator(
      offering(assess),
      { dt: -1 },
      requestBase,
    );
    expect(outcome).toMatchObject({
      ok: false,
      blockers: [
        {
          code: "invalid-simulator-parameter",
          origin: "configuration",
          itemId: "dt",
          message: "Time step is above 0",
        },
      ],
    });
    expect(assess).not.toHaveBeenCalled();
  });
});

describe("simulatorFromExperimentBackend", () => {
  const handle = {} as MonteCarloExperiment;
  const backendSeeing = (
    see: (request: ExperimentRequest) => void,
  ): ExperimentBackend => ({
    id: "fake",
    label: "Fake backend",
    needsHirTrees: false,
    isAvailable: () => true,
    assess: (request) => {
      see(request);
      return Promise.resolve({
        eligible: true,
        notes: [],
        instantiate: () =>
          Promise.resolve({ ok: true, handle, runtimeInfo: "2 workers" }),
      });
    },
  });
  const experiment = { runCount: 8, metricSpecs: [], samplePeriod: 0.1 };
  const startWith = async (
    backend: ExperimentBackend,
    request: SimulationRequestBase,
    samplePeriod = 0.1,
  ) => {
    const simulator = simulatorFromExperimentBackend<typeof stepParameters>(
      backend,
      (parameters) => parameters.dt,
    );
    const assessment = await simulator.assess({
      ...request,
      simulatorParameters: { dt: 0.1 },
    });
    if (!assessment.eligible || !assessment.startExperiment) {
      throw new Error("The adapter should offer experiments");
    }
    expect(assessment.startRun).toBeUndefined();
    return assessment.startExperiment({ ...experiment, samplePeriod });
  };

  it("starts the backend's experiment with the simulator's time step as its step", async () => {
    const see = vi.fn();
    const started = await startWith(backendSeeing(see), requestBase);
    expect(started).toEqual({ ok: true, handle, runtimeInfo: "2 workers" });
    expect(see).toHaveBeenCalledWith({
      sdcpn: emptyNet,
      initialMarking: {},
      parameterValues: {},
      seed: 1,
      dt: 0.1,
      maxTime: 10,
      runCount: 8,
      metricSpecs: [],
    });
  });

  it("refuses an experiment without a time to stop at", async () => {
    const see = vi.fn();
    const started = await startWith(backendSeeing(see), {
      ...requestBase,
      maxTime: null,
    });
    expect(started).toMatchObject({
      ok: false,
      blockers: [{ code: "experiment-needs-max-time" }],
    });
    expect(see).not.toHaveBeenCalled();
  });

  it("refuses a sample period that is not the time step", async () => {
    const see = vi.fn();
    const started = await startWith(backendSeeing(see), requestBase, 0.5);
    expect(started).toMatchObject({
      ok: false,
      blockers: [
        {
          code: "sample-period-differs-from-time-step",
          message: "Fake backend samples at its time step, 0.1 s",
        },
      ],
    });
    expect(see).not.toHaveBeenCalled();
  });

  it("passes on the backend's own refusal", async () => {
    const refusing: ExperimentBackend = {
      ...backendSeeing(() => {}),
      assess: () =>
        Promise.resolve({
          eligible: false,
          blockers: [
            {
              code: "no-transitions",
              message: "Nothing to fire",
              origin: "model",
            },
          ],
        }),
    };
    expect(await startWith(refusing, requestBase)).toEqual({
      ok: false,
      blockers: [
        { code: "no-transitions", message: "Nothing to fire", origin: "model" },
      ],
    });
  });
});
