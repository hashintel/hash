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

/** A net with a rate in it, so that time passes in its runs. */
const timedNet: SDCPN = {
  ...emptyNet,
  transitions: [
    {
      id: "arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 1);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
};

const timedRequest: SimulationRequestBase = {
  ...requestBase,
  sdcpn: timedNet,
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

  it("builds the request from the loaded simulator when given a function", async () => {
    const assess = vi.fn();
    const request = vi.fn(() => Promise.resolve(requestBase));
    await assessSimulator(offering(assess), {}, request);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ needsHirTrees: false }),
    );
    expect(assess).toHaveBeenCalledWith({
      ...requestBase,
      simulatorParameters: { dt: 0.1 },
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

  it("releases what the loaded simulator keeps: at once when it refuses, on dispose when it offers", async () => {
    const dispose = vi.fn();
    const loading = (eligible: boolean) =>
      defineSimulator(manifest, {
        isAvailable: () => true,
        load: () =>
          Promise.resolve({
            needsHirTrees: false,
            assess: () =>
              Promise.resolve(
                eligible
                  ? { eligible: true as const, notes: [] }
                  : {
                      eligible: false as const,
                      blockers: [
                        {
                          code: "test.refused",
                          message: "Refused",
                          origin: "model" as const,
                        },
                      ] as const,
                    },
              ),
            dispose,
          }),
      });

    const refused = await assessSimulator(loading(false), {}, requestBase);
    expect(refused.ok).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();

    dispose.mockClear();
    const offered = await assessSimulator(loading(true), {}, requestBase);
    if (!offered.ok) {
      throw new Error("The simulator should offer");
    }
    expect(dispose).not.toHaveBeenCalled();
    offered.dispose();
    expect(dispose).toHaveBeenCalledOnce();
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
      { timeStepParameter: "dt" },
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
    const started = await startWith(backendSeeing(see), timedRequest);
    expect(started).toEqual({ ok: true, handle, runtimeInfo: "2 workers" });
    expect(see).toHaveBeenCalledWith({
      sdcpn: timedNet,
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
      ...timedRequest,
      maxTime: null,
    });
    expect(started).toMatchObject({
      ok: false,
      blockers: [
        {
          code: "experiment-needs-max-time",
          message: "An experiment needs a time to stop at",
        },
      ],
    });
    expect(see).not.toHaveBeenCalled();
  });

  it("refuses a sample period that is not the time step", async () => {
    const see = vi.fn();
    const started = await startWith(backendSeeing(see), timedRequest, 0.5);
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
    expect(await startWith(refusing, timedRequest)).toEqual({
      ok: false,
      blockers: [
        { code: "no-transitions", message: "Nothing to fire", origin: "model" },
      ],
    });
  });

  it("hosts another simulator's runs in the backend's workers, at whatever period the experiment samples", async () => {
    const see = vi.fn();
    const simulator = simulatorFromExperimentBackend<typeof stepParameters>(
      backendSeeing(see),
      {
        simulatorOf: (parameters) => ({ id: "test.solver", parameters }),
      },
    );
    const assessment = await simulator.assess({
      ...timedRequest,
      simulatorParameters: { dt: 0.1 },
    });
    if (!assessment.eligible || !assessment.startExperiment) {
      throw new Error("The adapter should offer experiments");
    }

    await assessment.startExperiment({ ...experiment, samplePeriod: 0.5 });
    expect(see).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dt: 0.5,
        simulator: { id: "test.solver", parameters: { dt: 0.1 } },
      }),
    );

    // Without a period of its own, the experiment samples every 0.1 s.
    await assessment.startExperiment({ runCount: 8, metricSpecs: [] });
    expect(see).toHaveBeenLastCalledWith(expect.objectContaining({ dt: 0.1 }));
  });

  describe("for an untimed net", () => {
    const steppings = [
      ["its own engine", { timeStepParameter: "dt" }],
      [
        "a hosted simulator",
        {
          simulatorOf: (parameters: { dt: number }) => ({
            id: "test.solver",
            parameters,
          }),
        },
      ],
    ] as const;

    const assessWith = async (
      stepping: (typeof steppings)[number][1],
      see: (request: ExperimentRequest) => void,
      request: SimulationRequestBase = requestBase,
    ) => {
      const assessment = await simulatorFromExperimentBackend<
        typeof stepParameters
      >(backendSeeing(see), stepping).assess({
        ...request,
        simulatorParameters: { dt: 0.1 },
      });
      if (!assessment.eligible || !assessment.startExperiment) {
        throw new Error("The adapter should offer experiments");
      }
      return assessment.startExperiment;
    };

    it.each(steppings)(
      "samples every step with %s, whatever the simulator steps by",
      async (_name, stepping) => {
        const see = vi.fn();
        const startExperiment = await assessWith(stepping, see);

        await startExperiment({ runCount: 8, metricSpecs: [] });
        expect(see).toHaveBeenLastCalledWith(
          expect.objectContaining({ dt: 1, maxTime: 10 }),
        );

        await startExperiment({ ...experiment, samplePeriod: 1 });
        expect(see).toHaveBeenLastCalledWith(
          expect.objectContaining({ dt: 1 }),
        );
      },
    );

    it.each(steppings)(
      "refuses a sample period that is not a step with %s",
      async (_name, stepping) => {
        const see = vi.fn();
        const startExperiment = await assessWith(stepping, see);

        expect(
          await startExperiment({ ...experiment, samplePeriod: 0.1 }),
        ).toMatchObject({
          ok: false,
          blockers: [
            {
              code: "sample-period-differs-from-step",
              message: "An untimed net is sampled at every step",
            },
          ],
        });
        expect(see).not.toHaveBeenCalled();
      },
    );

    it("refuses an experiment without a step to stop at", async () => {
      const see = vi.fn();
      const startExperiment = await assessWith(steppings[0][1], see, {
        ...requestBase,
        maxTime: null,
      });

      expect(
        await startExperiment({ runCount: 8, metricSpecs: [] }),
      ).toMatchObject({
        ok: false,
        blockers: [
          {
            code: "experiment-needs-max-time",
            message: "An experiment needs a step to stop at",
          },
        ],
      });
      expect(see).not.toHaveBeenCalled();
    });
  });
});
