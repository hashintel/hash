import { createWorkerPoolExperimentBackend } from "../../experiments/worker-pool-experiment-backend";
import { isWebGpuAvailable } from "../../webgpu/support";
import {
  ADAPTIVE_SIMULATOR_ID,
  createEventSimulation,
  DEFAULT_SOLVER_TOLERANCE,
  FIXED_STEP_SIMULATOR_ID,
} from "../event-trace";
import { simulatorFromExperimentBackend } from "./experiment-backend-simulator";
import { defineSimulator } from "./simulator";

import type { ExperimentBackend } from "../../experiments/experiment-backend";
import type { GpuOdeMethod } from "../../webgpu/compile-net-shader/dynamics";
import type { WorkerFactory } from "../api";
import type { EventSimulation, StepperSelection } from "../event-trace";
import type {
  SimulatorParameterSpecs,
  StoredSimulatorParameters,
} from "./parameters";
import type {
  SimulationRequest,
  SimulatorManifest,
  SimulatorRegistration,
  SimulatorStart,
  SimulatorStartOptions,
} from "./simulator";

export const WEBGPU_FIXED_STEP_SIMULATOR_ID = "webgpu-fixed-step";

const timeStep = {
  type: "number",
  label: "Time step",
  description:
    "Simulated seconds per step. A smaller step is more accurate and slower.",
  unit: "s",
  default: 0.01,
  min: 0,
  exclusiveMin: true,
  scale: "log",
} as const;

export const jsFixedStepSimulatorManifest = {
  id: FIXED_STEP_SIMULATOR_ID,
  label: "JS fixed step",
  description: "Advances in steps of one size. Runs any net.",
  parameters: { dt: timeStep },
  produces: { run: true, experiment: true },
  samplePeriodParameter: "dt",
} as const satisfies SimulatorManifest;

export const jsAdaptiveSimulatorManifest = {
  id: ADAPTIVE_SIMULATOR_ID,
  label: "JS adaptive",
  description: "Chooses its own steps from the solver's error. Runs any net.",
  parameters: {
    tolerance: {
      type: "number",
      label: "Max error",
      description:
        "Largest error one solver step may make, as a fraction of an attribute's value and in absolute terms near zero.",
      default: DEFAULT_SOLVER_TOLERANCE,
      min: 0,
      exclusiveMin: true,
      scale: "log",
    },
  },
  produces: { run: true, experiment: true },
} as const satisfies SimulatorManifest;

export const webGpuFixedStepSimulatorManifest = {
  id: WEBGPU_FIXED_STEP_SIMULATOR_ID,
  label: "WebGPU fixed step",
  description: "Computes many runs at once on the graphics card.",
  parameters: {
    dt: { ...timeStep, default: 0.1 },
    odeMethod: {
      type: "enum",
      label: "ODE method",
      description: "How continuous dynamics are integrated over a step.",
      options: [
        { value: "euler", label: "Euler" },
        { value: "rk2", label: "Runge-Kutta 2" },
        { value: "rk4", label: "Runge-Kutta 4" },
      ],
      default: "rk4",
    },
  },
  produces: { run: false, experiment: true },
  samplePeriodParameter: "dt",
} as const satisfies SimulatorManifest;

/**
 * One run of a simulator whose stepper the event simulation worker hosts.
 * A net the worker cannot initialize is a refusal, named against the item
 * the engine blames.
 */
const startEventSimulationRun = async (
  request: SimulationRequest,
  simulator: StepperSelection,
  createWorker: WorkerFactory,
  options: SimulatorStartOptions | undefined,
): Promise<SimulatorStart<EventSimulation>> => {
  try {
    const handle = await createEventSimulation({
      sdcpn: request.sdcpn,
      ...(request.extensions === undefined
        ? {}
        : { extensions: request.extensions }),
      initialMarking: request.initialMarking,
      parameterValues: { ...request.parameterValues },
      seed: request.seed,
      maxTime: request.maxTime,
      ...(request.hirArtifacts === undefined
        ? {}
        : { hirArtifacts: request.hirArtifacts }),
      simulator,
      createWorker,
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    });
    return { ok: true, handle };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      ok: false,
      blockers: [
        {
          code: "run-failed-to-start",
          message: error instanceof Error ? error.message : String(error),
          origin: "model",
        },
      ],
    };
  }
};

const stepperSelection = (
  id: string,
  parameters: StoredSimulatorParameters,
): StepperSelection => ({ id, parameters });

export type JsFixedStepSimulatorOptions = {
  /** Builds the worker a single run is stepped in. */
  createRunWorker: WorkerFactory;
  /** Builds a worker of the pool an experiment's runs are split across. */
  createExperimentWorker: WorkerFactory;
  /** Workers per experiment. Defaults to the pool's own choice. */
  shardCount?: number;
  batchSize?: number;
};

/** The fixed-step engine in JS: single runs and experiments from one step loop. */
export const createJsFixedStepSimulator = (
  options: JsFixedStepSimulatorOptions,
): SimulatorRegistration<typeof jsFixedStepSimulatorManifest.parameters> =>
  defineSimulator(jsFixedStepSimulatorManifest, {
    isAvailable: () => true,
    load: () => {
      const experiments = simulatorFromExperimentBackend<
        typeof jsFixedStepSimulatorManifest.parameters
      >(
        createWorkerPoolExperimentBackend({
          createWorker: options.createExperimentWorker,
          ...(options.shardCount === undefined
            ? {}
            : { shardCount: options.shardCount }),
          ...(options.batchSize === undefined
            ? {}
            : { batchSize: options.batchSize }),
        }),
        { timeStepOf: (parameters) => parameters.dt },
      );
      return Promise.resolve({
        needsHirTrees: experiments.needsHirTrees,
        assess: async (request) => {
          const assessment = await experiments.assess(request);
          return assessment.eligible
            ? {
                ...assessment,
                startRun: (startOptions) =>
                  startEventSimulationRun(
                    request,
                    stepperSelection(
                      FIXED_STEP_SIMULATOR_ID,
                      request.simulatorParameters,
                    ),
                    options.createRunWorker,
                    startOptions,
                  ),
              }
            : assessment;
        },
      });
    },
  });

export type JsAdaptiveSimulatorOptions = {
  /** Builds the worker a single run is stepped in. */
  createRunWorker: WorkerFactory;
  /**
   * Builds a worker of the pool an experiment's runs are split across. It
   * has to host the simulator's stepper, as the worker of
   * `createMonteCarloWorker` does.
   */
  createExperimentWorker: WorkerFactory;
  /** Workers per experiment. Defaults to the pool's own choice. */
  shardCount?: number;
  batchSize?: number;
};

/**
 * The error-controlled solver in JS: single runs, and experiments whose runs
 * are each stepped by the solver and stopped at every sample time.
 */
export const createJsAdaptiveSimulator = (
  options: JsAdaptiveSimulatorOptions,
): SimulatorRegistration<typeof jsAdaptiveSimulatorManifest.parameters> =>
  defineSimulator(jsAdaptiveSimulatorManifest, {
    isAvailable: () => true,
    load: () => {
      const experiments = simulatorFromExperimentBackend<
        typeof jsAdaptiveSimulatorManifest.parameters
      >(
        createWorkerPoolExperimentBackend({
          createWorker: options.createExperimentWorker,
          ...(options.shardCount === undefined
            ? {}
            : { shardCount: options.shardCount }),
          ...(options.batchSize === undefined
            ? {}
            : { batchSize: options.batchSize }),
        }),
        {
          simulatorOf: (parameters) =>
            stepperSelection(ADAPTIVE_SIMULATOR_ID, parameters),
        },
      );
      return Promise.resolve({
        // The solver classifies each place's dynamics from its HIR.
        needsHirTrees: true,
        assess: async (request) => {
          const assessment = await experiments.assess(request);
          return assessment.eligible
            ? {
                ...assessment,
                startRun: (startOptions) =>
                  startEventSimulationRun(
                    request,
                    stepperSelection(
                      ADAPTIVE_SIMULATOR_ID,
                      request.simulatorParameters,
                    ),
                    options.createRunWorker,
                    startOptions,
                  ),
              }
            : assessment;
        },
      });
    },
  });

export type WebGpuFixedStepSimulatorOptions = {
  /**
   * Builds the WebGPU experiment backend for an ODE method. The host loads
   * it, so that the backend's module stays out of bundles that never run an
   * experiment on the GPU.
   */
  loadBackend: (options: {
    odeMethod: GpuOdeMethod;
  }) => Promise<ExperimentBackend>;
};

/** The fixed-step engine on the GPU. Experiments only. */
export const createWebGpuFixedStepSimulator = (
  options: WebGpuFixedStepSimulatorOptions,
): SimulatorRegistration<typeof webGpuFixedStepSimulatorManifest.parameters> =>
  defineSimulator(webGpuFixedStepSimulatorManifest, {
    isAvailable: isWebGpuAvailable,
    load: () => {
      type Specs = typeof webGpuFixedStepSimulatorManifest.parameters;
      // The ODE method is fixed when a backend is built, and a backend keeps
      // its device, shader and calibration across the batches of a sweep, so
      // one is kept per method for as long as the simulator lives.
      const byMethod = new Map<
        GpuOdeMethod,
        Promise<ReturnType<typeof simulatorFromExperimentBackend<Specs>>>
      >();
      return Promise.resolve({
        needsHirTrees: true,
        assess: async (request) => {
          const { odeMethod } = request.simulatorParameters;
          let simulator = byMethod.get(odeMethod);
          if (!simulator) {
            simulator = options.loadBackend({ odeMethod }).then((backend) =>
              simulatorFromExperimentBackend<Specs>(backend, {
                timeStepOf: (parameters) => parameters.dt,
              }),
            );
            byMethod.set(odeMethod, simulator);
          }
          return (await simulator).assess(request);
        },
        dispose: () => {
          for (const simulator of byMethod.values()) {
            void simulator.then((loaded) => loaded.dispose?.());
          }
          byMethod.clear();
        },
      });
    },
  });

/** The manifests of the built-in simulators, in picker order. */
export const builtInSimulatorManifests: readonly SimulatorManifest<SimulatorParameterSpecs>[] =
  [
    jsFixedStepSimulatorManifest,
    jsAdaptiveSimulatorManifest,
    webGpuFixedStepSimulatorManifest,
  ];
