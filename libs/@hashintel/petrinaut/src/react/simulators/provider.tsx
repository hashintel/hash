import { useEffect, useState } from "react";

import {
  createJsAdaptiveSimulator,
  createJsFixedStepSimulator,
  createWebGpuFixedStepSimulator,
  FIXED_STEP_SIMULATOR_ID,
  getDefaultMonteCarloShardCount,
  type SimulatorRegistration,
  type WorkerFactory,
} from "@hashintel/petrinaut-core";
import { createReusableWorkerFactory } from "@hashintel/petrinaut-core/experiments";
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
   * Builds a worker of the pool an experiment's runs are split across. It
   * has to host the simulators' steppers, as the worker of
   * `createMonteCarloWorker` does. Read once, when the provider mounts.
   */
  experimentWorkerFactory?: WorkerFactory;
  /**
   * How many workers an experiment of a built-in simulator splits its runs
   * across. Defaults to one per logical core minus one. Sharding changes how
   * quickly an experiment finishes, never what it reports. Read once, when
   * the provider mounts.
   */
  experimentShardCount?: number;
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
  shardCount,
}: {
  createRunWorker: WorkerFactory;
  createExperimentWorker: WorkerFactory;
  shardCount: number;
}): readonly SimulatorRegistration[] => [
  createJsFixedStepSimulator({
    createRunWorker,
    createExperimentWorker,
    shardCount,
  }),
  createJsAdaptiveSimulator({
    createRunWorker,
    createExperimentWorker,
    shardCount,
  }),
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
 *
 * The experiments of the built-in simulators lease their workers from one
 * pool. A sweep starts a batch per rung of its ladder and per cell of its
 * surface, and a fresh worker loads the engine and the compiled net before
 * it can step, so batches hand their workers back instead of ending them.
 */
export const SimulatorsProvider: React.FC<SimulatorsProviderProps> = ({
  children,
  runWorkerFactory,
  experimentWorkerFactory,
  experimentShardCount,
  registrations: hostRegistrations,
}) => {
  const [{ builtIns, experimentWorkers }] = useState(() => {
    // The simulators never inspect the host, so the piece that knows this is
    // a browser states the parallelism.
    const shardCount = experimentShardCount ?? getDefaultMonteCarloShardCount();
    const pool = createReusableWorkerFactory(
      experimentWorkerFactory ?? createMonteCarloWorker,
      // A sweep releases its working set at once: two sharded batches, as
      // the ladder pipelines its rungs, plus the surface's lanes. A pool
      // that holds less ends the overflow and respawns it a moment later.
      { maxIdle: 2 * shardCount + 8 },
    );
    return {
      experimentWorkers: pool,
      builtIns: createBuiltInSimulators({
        createRunWorker: runWorkerFactory ?? createEventSimulationWorker,
        createExperimentWorker: pool,
        shardCount,
      }),
    };
  });
  // Shut for good on unmount: a worker handed back afterwards is ended, as
  // nothing would lease it again.
  useEffect(() => () => experimentWorkers.dispose(), [experimentWorkers]);

  const value: SimulatorsContextValue = {
    registrations: hostRegistrations
      ? [...builtIns, ...hostRegistrations]
      : builtIns,
    defaultSelections: DEFAULT_SELECTIONS,
  };

  return <SimulatorsContext value={value}>{children}</SimulatorsContext>;
};
