import { selectExperimentBackend } from "@hashintel/petrinaut-core/experiments";

import { instantiateOnBackend } from "./shared/instantiate-on-backend";
import {
  constantRunPlan,
  sweptNetParameterIds,
  translateRangeDraws,
} from "./sweep-batch-instantiation/sweep-run-overrides";

import type { ExperimentParameterAxis } from "../parameter-grid";
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
  SelectExperimentBackendResult,
} from "@hashintel/petrinaut-core/experiments";

/**
 * Builds the sweep session's `instantiateBatch` for one experiment.
 *
 * The first batch walks the backend selection — so GPU-vs-CPU choice and
 * fallback reporting behave as for a plain experiment — and later batches
 * re-assess the chosen backend with their own request.
 *
 * Every batch carries the swept net parameters in its run plan, a point
 * selection as one constant row per run: the values then ride the per-run
 * buffer rather than being baked into the request, so the GPU backend keeps
 * one compiled setup — and its calibration — across every selection.
 */
export const createSweepBatchInstantiator = ({
  axes,
  registrations,
  buildRequest,
  compiler,
  netParameterVariableNames,
  onBackendChosen,
  onNote,
}: {
  axes: readonly ExperimentParameterAxis[];
  registrations: readonly ExperimentBackendRegistration[];
  buildRequest: BuildExperimentRequest;
  compiler: SweptScenarioCompiler;
  /** Net parameter variable names, for direct-override passthrough. */
  netParameterVariableNames: ReadonlySet<string>;
  onBackendChosen: (
    selection: Extract<SelectExperimentBackendResult, { ok: true }>,
  ) => void;
  onNote: (note: ExperimentNote) => void;
}): InstantiateSweepBatch => {
  let chosenBackend: ExperimentBackend | null = null;
  // Found on the first batch, where a compile error fails that batch rather
  // than the session's creation.
  let sweptIds: readonly string[] | null = null;

  return async ({ parameterValues, draws, seed, runCount, signal }) => {
    sweptIds ??= sweptNetParameterIds({
      axes,
      compileRunNumbers: compiler.compileRunNumbers,
      netParameterVariableNames,
    });
    const compiled = compiler.compileForValues(parameterValues);
    const baseParameters =
      compiler.compileRunNumbers(parameterValues).parameters;
    // A run's draws are scenario values; the simulation reads net
    // parameters. Re-evaluating the scenario's overrides at each run's draws
    // gives every backend net-keyed per-run values.
    const runPlan =
      draws === undefined
        ? constantRunPlan(sweptIds, baseParameters, runCount)
        : await translateRangeDraws({
            draws,
            signal,
            midValues: parameterValues,
            baseParameters,
            compileRunNumbers: compiler.compileRunNumbers,
            netParameterVariableNames,
            ids: sweptIds,
          });
    const override: ExperimentRequestOverride = {
      parameterValues: compiled.result.parameterValues,
      initialMarking: compiled.result.initialState,
      seed,
      runCount,
      ...(runPlan === undefined ? {} : { runPlan }),
    };

    if (chosenBackend === null) {
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

    const request = await buildRequest({
      needsHirTrees: chosenBackend.needsHirTrees,
      override,
    });
    return instantiateOnBackend(chosenBackend, request, { signal, onNote });
  };
};
