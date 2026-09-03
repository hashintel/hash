import { selectExperimentBackend } from "@hashintel/petrinaut-core/experiments";

import { instantiateOnBackend } from "./shared/instantiate-on-backend";
import {
  createCpuLanes,
  decideBatchLane,
} from "./sweep-batch-instantiation/backend-lanes";
import { translateRangeDraws } from "./sweep-batch-instantiation/sweep-run-overrides";

import type { InstantiateSweepBatch } from "../sweep-session";
import type {
  BuildExperimentRequest,
  ExperimentRequestOverride,
  SweptScenarioCompiler,
} from "./shared/experiment-request";
import type {
  ExperimentBackend,
  ExperimentBackendRegistration,
  ExperimentNote,
  ExperimentRunPlan,
  ReusableWorkerFactory,
  SelectExperimentBackendResult,
} from "@hashintel/petrinaut-core/experiments";

/** The batch's plan with its pinned seeds attached; seeds alone make a plan too. */
const seededPlan = (
  plan: ExperimentRunPlan | undefined,
  runSeeds: readonly number[] | undefined,
): ExperimentRunPlan | undefined =>
  runSeeds === undefined
    ? plan
    : {
        ids: plan?.ids ?? [],
        values: plan?.values ?? new Float64Array(0),
        seeds: runSeeds,
      };

/**
 * Builds the sweep session's `instantiateBatch` for one experiment.
 *
 * The first navigator batch walks the backend selection — so GPU-vs-CPU
 * choice and fallback reporting behave as for a plain experiment — and later
 * batches re-assess the chosen backend with their own request (the GPU
 * backend regenerates its shader for the new parameter values there).
 * Background batches take a CPU lane of their own; see `decideBatchLane`.
 */
export const createSweepBatchInstantiator = ({
  registrations,
  buildRequest,
  compiler,
  netParameterVariableNames,
  createWorker,
  shardCount,
  onBackendChosen,
  onNote,
}: {
  registrations: readonly ExperimentBackendRegistration[];
  buildRequest: BuildExperimentRequest;
  compiler: SweptScenarioCompiler;
  /** Net parameter variable names, for direct-override passthrough. */
  netParameterVariableNames: ReadonlySet<string>;
  createWorker: ReusableWorkerFactory;
  /** The full pool's width; the background lanes derive theirs from it. */
  shardCount: number;
  onBackendChosen: (
    selection: Extract<SelectExperimentBackendResult, { ok: true }>,
  ) => void;
  onNote: (note: ExperimentNote) => void;
}): InstantiateSweepBatch => {
  let chosenBackend: ExperimentBackend | null = null;
  const cpuLanes = createCpuLanes({ createWorker, shardCount });

  return async ({
    parameterValues,
    draws,
    seed,
    runCount,
    background = false,
    requiresRunResults = false,
    foregroundActive = false,
    runSeeds,
    signal,
  }) => {
    const compiled = compiler.compileForValues(parameterValues);
    const baseParameters =
      compiler.compileRunNumbers(parameterValues).parameters;
    // A run's draws are scenario values; the simulation reads net
    // parameters. Re-evaluating the scenario's overrides at each run's draws
    // gives every backend net-keyed per-run values.
    const plan =
      draws === undefined
        ? undefined
        : await translateRangeDraws({
            draws,
            signal,
            midValues: parameterValues,
            baseParameters,
            compileRunNumbers: compiler.compileRunNumbers,
            netParameterVariableNames,
          });
    const runPlan = seededPlan(plan, runSeeds);
    const override: ExperimentRequestOverride = {
      parameterValues: compiled.result.parameterValues,
      initialMarking: compiled.result.initialState,
      seed,
      runCount,
      ...(runPlan === undefined ? {} : { runPlan }),
    };

    const lane = decideBatchLane({
      background,
      requiresRunResults,
      foregroundActive,
      chosenBackend,
    });
    if (lane.kind === "select") {
      const selection = await selectExperimentBackend({
        registrations,
        buildRequest: ({ needsHirTrees }) =>
          buildRequest({ needsHirTrees, override }),
        instantiateOptions: { signal, onNote },
      });
      if (!selection.ok) {
        throw new Error(
          selection.declined
            .map((entry) => `${entry.backendId}: ${entry.reason}`)
            .join("; ") || "No compute backend could run this experiment.",
        );
      }
      chosenBackend = selection.backend;
      onBackendChosen(selection);
      return selection.handle;
    }

    const backend =
      lane.kind === "cpu" ? cpuLanes.lane(lane.width) : lane.backend;
    const request = await buildRequest({
      needsHirTrees: backend.needsHirTrees,
      override,
    });
    return instantiateOnBackend(backend, request, { signal, onNote });
  };
};
