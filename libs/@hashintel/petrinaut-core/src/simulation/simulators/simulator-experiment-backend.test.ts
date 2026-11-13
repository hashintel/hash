import { describe, expect, it } from "vitest";

import { selectExperimentBackend } from "../../experiments/select-experiment-backend";
import { compileHirArtifacts } from "../../hir/compile";
import { createStepperRunDriverFactory } from "../event-trace/worker/stepper-run-driver";
import { createInProcessMonteCarloWorker } from "../monte-carlo/worker/in-process-worker";
import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  jsAdaptiveSimulatorManifest,
  jsFixedStepSimulatorManifest,
  webGpuFixedStepSimulatorManifest,
} from "./built-in";
import {
  createExperimentReader,
  placeCountMetricSpecs,
} from "./experiment-reader";
import { defineSimulator } from "./simulator";
import {
  experimentBackendOfSimulator,
  experimentSamplePeriod,
  simulatorSamplePeriod,
} from "./simulator-experiment-backend";

import type { ExperimentRequest } from "../../experiments/experiment-request";
import type { SDCPN } from "../../types/sdcpn";
import type { MonteCarloExperiment } from "../monte-carlo/runtime/experiment";
import type { SimulatorRegistration } from "./simulator";

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

/** An untimed net: a source that fires on every step into `sink`. */
const emitter: SDCPN = {
  ...poisson,
  transitions: poisson.transitions.map((transition) => ({
    ...transition,
    lambdaType: "predicate",
    lambdaCode: "",
  })),
};

const buildRequest =
  (dt: number, sdcpn: SDCPN = poisson, maxTime = 2) =>
  ({ needsHirTrees }: { needsHirTrees: boolean }): Promise<ExperimentRequest> =>
    Promise.resolve({
      sdcpn,
      hirArtifacts: compileHirArtifacts(sdcpn, undefined, {
        includeHir: needsHirTrees,
      }).artifacts,
      initialMarking: { sink: 0 },
      parameterValues: {},
      seed: 2,
      dt,
      maxTime,
      runCount: 120,
      metricSpecs: placeCountMetricSpecs(sdcpn.places),
    });

const neverUsed = () => {
  throw new Error("No single run is started here");
};
const hostingWorker = () =>
  createInProcessMonteCarloWorker({
    createRunDriver: createStepperRunDriverFactory,
  });
const workers = {
  createRunWorker: neverUsed,
  createExperimentWorker: hostingWorker,
};
const adaptive = createJsAdaptiveSimulator(workers) as SimulatorRegistration;
const fixedStep = createJsFixedStepSimulator(workers) as SimulatorRegistration;

const finished = (experiment: MonteCarloExperiment) =>
  new Promise<string>((resolve) => {
    experiment.events.subscribe((event) =>
      resolve(event.type === "error" ? event.message : event.type),
    );
    experiment.start();
  });

describe("simulatorSamplePeriod", () => {
  it("is the time step of a simulator that samples at one, stored or by default", () => {
    expect(simulatorSamplePeriod(jsFixedStepSimulatorManifest, {})).toBe(0.01);
    expect(
      simulatorSamplePeriod(jsFixedStepSimulatorManifest, { dt: 0.25 }),
    ).toBe(0.25);
    expect(simulatorSamplePeriod(webGpuFixedStepSimulatorManifest, {})).toBe(
      0.1,
    );
  });

  it("is null for a simulator that leaves the period to the experiment", () => {
    expect(
      simulatorSamplePeriod(jsAdaptiveSimulatorManifest, { tolerance: 1e-3 }),
    ).toBeNull();
  });

  it("is refused at declaration when it names no number parameter", () => {
    expect(() =>
      defineSimulator(
        {
          id: "bad",
          label: "Bad",
          description: "",
          parameters: {
            fast: { type: "boolean", label: "Fast", default: true },
          },
          produces: { run: false, experiment: true },
          samplePeriodParameter: "fast",
        },
        { isAvailable: () => true, load: neverUsed },
      ),
    ).toThrow('samples at "fast"');
  });
});

describe("experimentSamplePeriod", () => {
  it("is the simulator's own answer on a clock of time", () => {
    expect(
      experimentSamplePeriod("time", jsFixedStepSimulatorManifest, {
        dt: 0.25,
      }),
    ).toBe(0.25);
    expect(
      experimentSamplePeriod("time", jsAdaptiveSimulatorManifest, {}),
    ).toBeNull();
  });

  it("is one step on a clock of steps, whatever the simulator steps by", () => {
    expect(
      experimentSamplePeriod("steps", jsFixedStepSimulatorManifest, {
        dt: 0.25,
      }),
    ).toBe(1);
    expect(
      experimentSamplePeriod("steps", jsAdaptiveSimulatorManifest, {}),
    ).toBe(1);
  });
});

describe("a simulator as an experiment backend", () => {
  it("computes the experiment the backend selection asks the adaptive simulator for", async () => {
    const selection = await selectExperimentBackend({
      registrations: [experimentBackendOfSimulator(adaptive, {})],
      buildRequest: buildRequest(0.5),
    });
    if (!selection.ok) {
      throw new Error(selection.declined[0]?.reason);
    }
    expect(selection.backendId).toBe("js-adaptive");
    // The solver reads the HIR trees, and says so through the backend.
    expect(selection.backend.needsHirTrees).toBe(true);
    expect(await finished(selection.handle)).toBe("complete");
    const reader = createExperimentReader(selection.handle.metrics);
    // The request's step is the sample period: 0, 0.5, 1, 1.5 and 2.
    expect(reader.metricFrames("place-count:sink")).toHaveLength(5);
    expect(reader.placeCountAt("sink", 2)?.runCount).toBe(120);
    selection.handle.dispose();
  });

  it("falls back to the next simulator when one refuses the request's sample period", async () => {
    const selection = await selectExperimentBackend({
      registrations: [
        // Steps at 0.01 s, so it cannot sample every 0.5 s.
        experimentBackendOfSimulator(fixedStep, {}),
        experimentBackendOfSimulator(fixedStep, { dt: 0.5 }),
      ],
      buildRequest: buildRequest(0.5),
    });
    if (!selection.ok) {
      throw new Error(selection.declined[0]?.reason);
    }
    expect(selection.declined).toEqual([
      {
        backendId: "js-fixed-step",
        origin: "configuration",
        reason: "CPU (Web Workers) samples at its time step, 0.01 s",
      },
    ]);
    expect(await finished(selection.handle)).toBe("complete");
    expect(
      createExperimentReader(selection.handle.metrics).metricFrames(
        "place-count:sink",
      ),
    ).toHaveLength(5);
    selection.handle.dispose();
  });

  it.each([
    ["fixed-step", fixedStep],
    ["adaptive", adaptive],
  ])(
    "samples an untimed net at every step with the %s simulator",
    async (_name, simulator) => {
      const selection = await selectExperimentBackend({
        registrations: [experimentBackendOfSimulator(simulator, {})],
        buildRequest: buildRequest(1, emitter, 4),
      });
      if (!selection.ok) {
        throw new Error(selection.declined[0]?.reason);
      }
      expect(await finished(selection.handle)).toBe("complete");
      const reader = createExperimentReader(selection.handle.metrics);
      // The start and four steps, each adding one token in every run.
      expect(
        reader
          .metricFrames("place-count:sink")
          .map((frame) => [
            frame.time,
            reader.placeCountAt("sink", frame.time)?.mean,
          ]),
      ).toEqual([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ]);
      selection.handle.dispose();
    },
  );

  it("refuses to sample an untimed net at anything but a step", async () => {
    const selection = await selectExperimentBackend({
      registrations: [experimentBackendOfSimulator(adaptive, {})],
      buildRequest: buildRequest(0.5, emitter),
    });
    expect(selection).toMatchObject({
      ok: false,
      declined: [{ reason: "An untimed net is sampled at every step" }],
    });
  });

  it("refuses parameter values the simulator's spec rejects, naming the parameter", async () => {
    const backend = await experimentBackendOfSimulator(adaptive, {
      tolerance: -1,
    }).load();
    const assessment = await backend.assess(
      await buildRequest(0.5)({ needsHirTrees: true }),
    );
    expect(assessment).toMatchObject({
      eligible: false,
      blockers: [
        {
          code: "invalid-simulator-parameter",
          origin: "configuration",
          itemId: "tolerance",
        },
      ],
    });
  });

  it("refuses a simulator that computes single runs only", async () => {
    const runsOnly = defineSimulator(
      {
        id: "runs-only",
        label: "Runs only",
        description: "",
        parameters: {},
        produces: { run: true, experiment: false },
      },
      {
        isAvailable: () => true,
        load: () =>
          Promise.resolve({
            needsHirTrees: false,
            assess: () => Promise.resolve({ eligible: true, notes: [] }),
          }),
      },
    );
    const backend = await experimentBackendOfSimulator(runsOnly, {}).load();
    expect(
      await backend.assess(await buildRequest(0.5)({ needsHirTrees: false })),
    ).toMatchObject({
      eligible: false,
      blockers: [{ message: "Runs only computes one run at a time" }],
    });
  });

  it("refuses a simulator this environment cannot run, without loading it", async () => {
    const unavailable = defineSimulator(
      {
        id: "elsewhere",
        label: "Elsewhere",
        description: "",
        parameters: {},
        produces: { run: false, experiment: true },
      },
      { isAvailable: () => false, load: neverUsed },
    );
    const selection = await selectExperimentBackend({
      registrations: [experimentBackendOfSimulator(unavailable, {})],
      buildRequest: buildRequest(0.5),
    });
    expect(selection).toEqual({
      ok: false,
      declined: [
        {
          backendId: "elsewhere",
          origin: "environment",
          reason: "Elsewhere is not available in this environment.",
        },
      ],
    });
  });
});
