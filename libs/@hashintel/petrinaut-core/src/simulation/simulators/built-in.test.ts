import { describe, expect, it, vi } from "vitest";

import { compileHirArtifacts } from "../../hir/compile";
import { createStepperRunDriverFactory } from "../event-trace/worker/stepper-run-driver";
import { createInProcessMonteCarloWorker } from "../monte-carlo/worker/in-process-worker";
import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
} from "./built-in";
import {
  createExperimentReader,
  placeCountMetricSpecs,
} from "./experiment-reader";
import { assessSimulator } from "./simulator";

import type { SDCPN } from "../../types/sdcpn";
import type { MonteCarloExperiment } from "../monte-carlo/runtime/experiment";
import type { SimulationRequestBase, SimulatorRegistration } from "./simulator";

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

const request = (hirTrees: boolean): SimulationRequestBase => ({
  sdcpn: poisson,
  hirArtifacts: compileHirArtifacts(poisson, undefined, {
    includeHir: hirTrees,
  }).artifacts,
  initialMarking: { sink: 0 },
  parameterValues: {},
  seed: 2,
  maxTime: 2,
});

const neverUsed = () => {
  throw new Error("No single run is started here");
};
/** The worker the editor uses, on this thread: it hosts every stepper. */
const hostingWorker = () =>
  createInProcessMonteCarloWorker({
    createRunDriver: createStepperRunDriverFactory,
  });

const finished = (experiment: MonteCarloExperiment) =>
  new Promise<string>((resolve) => {
    experiment.events.subscribe((event) =>
      resolve(event.type === "error" ? event.message : event.type),
    );
    experiment.start();
  });

const startExperiment = async (
  registration: SimulatorRegistration,
  samplePeriod?: number,
) => {
  const outcome = await assessSimulator(registration, {}, (simulator) =>
    request(simulator.needsHirTrees),
  );
  if (!outcome.ok || !outcome.offer.startExperiment) {
    throw new Error("The simulator should offer experiments");
  }
  return outcome.offer.startExperiment({
    runCount: 120,
    metricSpecs: placeCountMetricSpecs(poisson.places),
    ...(samplePeriod === undefined ? {} : { samplePeriod }),
  });
};

describe("the built-in simulators' experiments", () => {
  it("computes an experiment with the adaptive simulator, sampled at the period asked for", async () => {
    const started = await startExperiment(
      createJsAdaptiveSimulator({
        createRunWorker: neverUsed,
        createExperimentWorker: hostingWorker,
      }) as SimulatorRegistration,
      0.5,
    );
    if (!started.ok) {
      throw new Error(started.blockers[0].message);
    }
    expect(await finished(started.handle)).toBe("complete");

    const reader = createExperimentReader(started.handle.metrics);
    expect(reader.coveredTime()).toBe(2);
    // Sampled at 0, 0.5, 1, 1.5 and 2.
    expect(reader.metricFrames("place-count:sink")).toHaveLength(5);
    const atEnd = reader.placeCountAt("sink", 2);
    expect(atEnd?.runCount).toBe(120);
    // Arrivals at rate 5 for 2 s: ten on average, within what 120 runs scatter.
    expect(Math.abs((atEnd?.mean ?? 0) - 10)).toBeLessThan(
      4 * Math.sqrt(10 / 120),
    );
    started.handle.dispose();
  });

  it("samples the adaptive simulator every tenth of a second when no period is asked for", async () => {
    const started = await startExperiment(
      createJsAdaptiveSimulator({
        createRunWorker: neverUsed,
        createExperimentWorker: hostingWorker,
      }) as SimulatorRegistration,
    );
    if (!started.ok) {
      throw new Error(started.blockers[0].message);
    }
    await finished(started.handle);
    expect(
      createExperimentReader(started.handle.metrics).metricFrames(
        "place-count:sink",
      ),
    ).toHaveLength(21);
    started.handle.dispose();
  });

  it("refuses the adaptive simulator on a worker that does not host its stepper", async () => {
    const started = await startExperiment(
      createJsAdaptiveSimulator({
        createRunWorker: neverUsed,
        createExperimentWorker: () => createInProcessMonteCarloWorker(),
      }) as SimulatorRegistration,
    );
    expect(started).toMatchObject({
      ok: false,
      blockers: [
        {
          message:
            'Simulator "js-adaptive" is not hosted by this Monte Carlo worker',
        },
      ],
    });
  });

  it("computes the fixed-step simulator's experiment at its time step", async () => {
    const started = await startExperiment(
      createJsFixedStepSimulator({
        createRunWorker: neverUsed,
        createExperimentWorker: hostingWorker,
      }) as SimulatorRegistration,
    );
    if (!started.ok) {
      throw new Error(started.blockers[0].message);
    }
    expect(await finished(started.handle)).toBe("complete");
    // The default step of 0.01 s over 2 s.
    expect(
      createExperimentReader(started.handle.metrics).metricFrames(
        "place-count:sink",
      ),
    ).toHaveLength(201);
    started.handle.dispose();
  });

  it("refuses, and loads again next time, when the WebGPU backend fails to load", async () => {
    vi.stubGlobal("navigator", { gpu: {} });
    try {
      const loadBackend = vi
        .fn()
        .mockRejectedValue(new Error("The chunk did not arrive"));
      const registration = createWebGpuFixedStepSimulator({
        loadBackend,
      }) as SimulatorRegistration;

      const first = await assessSimulator(registration, {}, request(true));
      expect(first).toMatchObject({
        ok: false,
        blockers: [
          {
            code: "backend-failed-to-load",
            origin: "environment",
            message:
              "The WebGPU backend could not be loaded: The chunk did not arrive",
          },
        ],
      });
      // The failure is not kept: the simulator of one load asks again.
      const simulator = await registration.load();
      const parameters = { dt: 0.1, odeMethod: "rk4" };
      const base = { ...request(true), simulatorParameters: parameters };
      loadBackend.mockClear();
      await simulator.assess(base);
      await simulator.assess(base);
      expect(loadBackend).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
