/**
 * The experiment backend that runs the buffer-ABI engine across Web Workers.
 *
 * Named for the mechanism rather than the silicon: the same runtime also runs
 * in-thread, and a caller-supplied transport may be a Node `worker_threads`
 * channel. Its id is `cpu`, the axis users choose along and what
 * `ExperimentRecord.computeBackend` records.
 *
 * This is the fallback, so assessment accepts every net; whether a net needs
 * compiled artifacts is the engine's rule, and instantiation reports what the
 * engine says rather than restating it.
 */
import { createMonteCarloExperiment } from "../simulation/monte-carlo/runtime/experiment";
import { expandRunPlan } from "./worker-pool-experiment-backend/expand-run-plan";

import type { WorkerFactory } from "../simulation/api";
import type {
  ExperimentAssessment,
  ExperimentBlockers,
} from "./experiment-assessment";
import type { ExperimentBackend } from "./experiment-backend";
import type { ExperimentRequest } from "./experiment-request";

export const WORKER_POOL_BACKEND_ID = "cpu";

export type WorkerPoolExperimentBackendOptions = {
  /** Spawns one simulation worker. Host wiring, so bound here rather than carried by the request. */
  createWorker: WorkerFactory;
  /**
   * How many workers to split runs across. Seeds derive from the global run
   * index, so this only changes how fast an experiment finishes, never what
   * it reports. Defaults to one per logical core minus one.
   */
  shardCount?: number;
  batchSize?: number;
};

const assess = (
  request: ExperimentRequest,
  options: WorkerPoolExperimentBackendOptions,
): ExperimentAssessment => {
  if (request.runs !== undefined && request.runPlan !== undefined) {
    return {
      eligible: false,
      blockers: [
        {
          code: "conflicting-run-overrides",
          message:
            "Per-run overrides were given both as `runs` and as a `runPlan`; an experiment takes one or the other.",
          origin: "configuration",
        },
      ],
    };
  }
  const runs =
    request.runs ??
    (request.runPlan === undefined
      ? undefined
      : expandRunPlan(
          request.runPlan,
          request.runCount,
          request.sdcpn.parameters,
        ));

  return {
    eligible: true,
    notes: [],
    instantiate: async (instantiateOptions) => {
      try {
        const handle = await createMonteCarloExperiment({
          sdcpn: request.sdcpn,
          ...(request.extensions === undefined
            ? {}
            : { extensions: request.extensions }),
          initialMarking: request.initialMarking,
          parameterValues: { ...request.parameterValues },
          seed: request.seed,
          dt: request.dt,
          maxTime: request.maxTime,
          runCount: request.runCount,
          ...(runs === undefined ? {} : { runs }),
          metricSpecs: request.metricSpecs,
          ...(request.hirArtifacts === undefined
            ? {}
            : { hirArtifacts: request.hirArtifacts }),
          createWorker: options.createWorker,
          ...(options.shardCount === undefined
            ? {}
            : { shardCount: options.shardCount }),
          ...(options.batchSize === undefined
            ? {}
            : { batchSize: options.batchSize }),
          ...(instantiateOptions?.signal === undefined
            ? {}
            : { signal: instantiateOptions.signal }),
        });

        return {
          ok: true,
          handle,
          runtimeInfo:
            options.shardCount === undefined
              ? "Web Workers"
              : `Web Workers (${options.shardCount} shards)`,
        };
      } catch (error) {
        // A cancellation is the caller's decision, not a refusal: reported as
        // a blocker it would send the selection walk on to the next backend.
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        // The engine refuses a net whose user code has no compiled artifact.
        // `configuration` because the fix is to compile, not to edit the net.
        const blockers: ExperimentBlockers = [
          {
            code: "engine-refused",
            message: error instanceof Error ? error.message : String(error),
            origin: "configuration",
          },
        ];
        return { ok: false, blockers };
      }
    },
  };
};

export const createWorkerPoolExperimentBackend = (
  options: WorkerPoolExperimentBackendOptions,
): ExperimentBackend => ({
  id: WORKER_POOL_BACKEND_ID,
  label: "CPU (Web Workers)",
  // The engine reads compiled buffer programs, never the HIR trees they came
  // from, and the trees roughly triple the artifact posted to every shard.
  needsHirTrees: false,
  isAvailable: () => true,
  assess: (request) => Promise.resolve(assess(request, options)),
});
