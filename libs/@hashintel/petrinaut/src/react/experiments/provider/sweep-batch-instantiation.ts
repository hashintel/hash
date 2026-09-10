import { selectExperimentBackend } from "@hashintel/petrinaut-core/experiments";

import { instantiateOnBackend } from "./shared/instantiate-on-backend";
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
  SelectExperimentBackendResult,
} from "@hashintel/petrinaut-core/experiments";

/**
 * Builds the sweep session's `instantiateBatch` for one experiment.
 *
 * The first batch walks the backend selection — so GPU-vs-CPU choice and
 * fallback reporting behave as for a plain experiment — and later batches
 * re-assess the chosen backend with their own request (the GPU backend
 * regenerates its shader for the new parameter values there).
 */
export const createSweepBatchInstantiator = ({
  registrations,
  buildRequest,
  compiler,
  netParameterVariableNames,
  onBackendChosen,
  onNote,
}: {
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

  return async ({ parameterValues, draws, seed, runCount, signal }) => {
    const compiled = compiler.compileForValues(parameterValues);
    const baseParameters =
      compiler.compileRunNumbers(parameterValues).parameters;
    // A run's draws are scenario values; the simulation reads net
    // parameters. Re-evaluating the scenario's overrides at each run's draws
    // gives every backend net-keyed per-run values.
    const runPlan =
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
