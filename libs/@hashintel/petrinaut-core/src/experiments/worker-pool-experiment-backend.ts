/**
 * The experiment backend that runs the buffer-ABI engine across Web Workers.
 *
 * Named for the mechanism rather than the silicon. `web-workers` would be wrong
 * in both directions: the same runtime also runs entirely in-thread when metrics
 * are supplied as executable callbacks (`createLocalMonteCarloExperiment`), and a
 * caller-supplied `transport` may be a Node `worker_threads` channel. Its **id**
 * stays `"cpu"`, because that is the axis users choose along, the word the UI
 * already uses ("running on the CPU"), and what `ExperimentRecord.computeBackend`
 * records.
 *
 * This is the fallback, so it accepts every net: assessment is unconditionally
 * eligible. Deciding *here* whether a net needs compiled artifacts would restate
 * a rule `build-simulation.ts` already owns, and a second copy of that rule would
 * eventually disagree with the engine. Instead instantiation reports what the
 * engine says, which is the single source of truth.
 */
import { createMonteCarloExperiment } from "../simulation/monte-carlo/runtime/experiment";

import type { WorkerFactory } from "../simulation/api";
import type {
  ExperimentAssessment,
  ExperimentBlockers,
} from "./experiment-assessment";
import type { ExperimentBackend } from "./experiment-backend";
import type { ExperimentRequest } from "./experiment-request";

export const WORKER_POOL_BACKEND_ID = "cpu";

export type WorkerPoolExperimentBackendOptions = {
  /**
   * Spawns one simulation worker.
   *
   * Bound here rather than passed per request because it is host wiring, not part
   * of what to compute, the same reason it is absent from `ExperimentRequest`. A
   * React provider supplies it once for the whole app.
   */
  createWorker: WorkerFactory;
  /**
   * How many workers to split runs across.
   *
   * Runs are independent and seeds derive from the global run index, so this only
   * changes how fast an experiment finishes, never what it reports. Defaults to
   * one per logical core minus one.
   */
  shardCount?: number;
  batchSize?: number;
};

function assess(
  request: ExperimentRequest,
  options: WorkerPoolExperimentBackendOptions,
): ExperimentAssessment {
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
        // A cancellation is the caller's decision, not a refusal: reporting it
        // as a blocker would send the selection walk on to the next backend
        // for an experiment nobody wants any more.
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        // The engine refuses a net whose user code has no compiled artifact, and
        // it phrases that better than this layer could. Reported as
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
}

export function createWorkerPoolExperimentBackend(
  options: WorkerPoolExperimentBackendOptions,
): ExperimentBackend {
  return {
    id: WORKER_POOL_BACKEND_ID,
    label: "CPU (Web Workers)",
    // The engine reads compiled buffer programs, never the HIR trees they came
    // from, and carrying the trees roughly triples artifact size on a payload
    // posted to every shard.
    needsHirTrees: false,
    isAvailable: () => true,
    assess: (request) => Promise.resolve(assess(request, options)),
  };
}
