import { useState } from "react";

import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  FIXED_STEP_SIMULATOR_ID,
  getDefaultMonteCarloShardCount,
  type SimulatorRegistration,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";
import { createEventSimulationWorker } from "@hashintel/petrinaut-core/workers/event-simulation";
import { createMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import { SimulatorsContext, type SimulatorsContextValue } from "./context";

export type SimulatorsProviderProps = React.PropsWithChildren<{
  /**
   * Builds the worker a single run is stepped in. Hosts that consume the
   * published dist pass their own, bundled through their own tooling; the
   * default inlines the worker as a blob. Read once, when the provider
   * mounts.
   */
  runWorkerFactory?: WorkerFactory;
  /**
   * Builds a worker of the pool an experiment's runs are split across. Read
   * once, when the provider mounts.
   */
  experimentWorkerFactory?: WorkerFactory;
  /** Simulators the host adds after the built-in ones. */
  registrations?: readonly SimulatorRegistration[];
}>;

const DEFAULT_SELECTIONS: SimulatorsContextValue["defaultSelections"] = {
  quick: { simulatorId: FIXED_STEP_SIMULATOR_ID },
  // The step experiments have always started on.
  stochastic: { simulatorId: FIXED_STEP_SIMULATOR_ID, parameters: { dt: 0.1 } },
};

const createBuiltInSimulators = ({
  createRunWorker,
  createExperimentWorker,
}: {
  createRunWorker: WorkerFactory;
  createExperimentWorker: WorkerFactory;
}): readonly SimulatorRegistration[] => [
  createJsFixedStepSimulator({
    createRunWorker,
    createExperimentWorker,
    // The simulator never inspects the host, so the piece that knows this
    // is a browser states the parallelism.
    shardCount: getDefaultMonteCarloShardCount(),
  }),
  createJsAdaptiveSimulator({ createRunWorker }),
  createWebGpuFixedStepSimulator({
    // Imported here, not at module scope, so a session that never asks for
    // the GPU never loads the shader generator.
    loadBackend: async (options) => {
      const { createWebGpuExperimentBackend } =
        await import("@hashintel/petrinaut-core/webgpu");
      return createWebGpuExperimentBackend(options);
    },
  }),
];

/**
 * Registers the built-in simulators, and whatever the host adds, for the
 * providers below. The built-in registrations are made once, with the
 * worker factories the provider mounts with: a simulator keeps what it
 * loads for as long as it lives.
 */
export const SimulatorsProvider: React.FC<SimulatorsProviderProps> = ({
  children,
  runWorkerFactory,
  experimentWorkerFactory,
  registrations: hostRegistrations,
}) => {
  const [builtIns] = useState(() =>
    createBuiltInSimulators({
      createRunWorker: runWorkerFactory ?? createEventSimulationWorker,
      createExperimentWorker: experimentWorkerFactory ?? createMonteCarloWorker,
    }),
  );

  const value: SimulatorsContextValue = {
    registrations: hostRegistrations
      ? [...builtIns, ...hostRegistrations]
      : builtIns,
    defaultSelections: DEFAULT_SELECTIONS,
  };

  return <SimulatorsContext value={value}>{children}</SimulatorsContext>;
};
