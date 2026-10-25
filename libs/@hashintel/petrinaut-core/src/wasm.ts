import { createWorkerPoolExperimentBackend } from "./experiments/worker-pool-experiment-backend";
import { getWasmHost } from "./wasm/host";
import { prepareWasmModel } from "./wasm/prepare-model";

import type { WorkerLike } from "./environment";
import type { ExperimentBackend } from "./experiments/experiment-backend";
import type { WorkerPoolExperimentBackendOptions } from "./experiments/worker-pool-experiment-backend";

export type WasmExperimentBackendOptions = Omit<
  WorkerPoolExperimentBackendOptions,
  "createWorker"
> & {
  createWorker?: () => WorkerLike | Promise<WorkerLike>;
};

const createWasmWorker = async (): Promise<WorkerLike> => {
  const WasmWorker = await import("./wasm/experiment.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new WasmWorker.default();
};

export const createWasmExperimentBackend = (
  options: WasmExperimentBackendOptions = {},
): ExperimentBackend => {
  const pool = createWorkerPoolExperimentBackend({
    ...options,
    createWorker: options.createWorker ?? createWasmWorker,
  });
  return {
    id: "wasm",
    label: "Wasm (Rust, experimental)",
    needsHirTrees: true,
    isAvailable: () => getWasmHost() !== undefined,
    assess: async (request) => {
      try {
        prepareWasmModel(request);
      } catch (error) {
        return {
          eligible: false,
          blockers: [
            {
              code: "wasm-unsupported",
              message: error instanceof Error ? error.message : String(error),
              origin: "model",
            },
          ],
        };
      }
      const assessment = await pool.assess(request);
      if (!assessment.eligible) {
        return assessment;
      }
      return {
        ...assessment,
        notes: [],
        instantiate: async (instantiateOptions) => {
          const result = await assessment.instantiate(instantiateOptions);
          return result.ok
            ? {
                ...result,
                runtimeInfo:
                  "Rust/Wasm runtime + runtime-compiled Wasm model (ABI 1)",
              }
            : result;
        },
      };
    },
  };
};
