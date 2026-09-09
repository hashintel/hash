/**
 * A trial's constraints as the channel evaluates them: the parameter
 * constraints at the trial's values before anything simulates, and the state
 * constraints as 0/1 metrics whose per-run verdicts come back with the
 * batch. Everything here reports; the objective is never changed by it.
 */
import {
  compileStateConstraintIndicator,
  constraintLabel,
  constraintsInSpace,
  deriveDefaultParameterValues,
  evaluateParameterConstraints,
  getOwn,
  type ParameterConstraintResult,
} from "@hashintel/petrinaut-core";

import type {
  DetachedObjectiveAuxiliaryMetric,
  DetachedObjectiveRunResult,
} from "../../../experiments/context";
import type {
  PetrinautOptimizationManifest,
  PetrinautOptimizationTrialConstraints,
} from "@hashintel/petrinaut-core/optimization";

export type ParameterConstraintOutcome = {
  results: ParameterConstraintResult[];
  /** The first constraint the draw broke, or null when every one holds. */
  infeasible: string | null;
};

/**
 * The parameter constraints' margins at the trial's values, with `parameters`
 * bound to the net's defaults and `scenario` to the trial's values (booleans
 * as 0/1). Null when the manifest has no parameter constraints. Throws
 * where interpretation would.
 */
export const parameterConstraintOutcome = (
  manifest: PetrinautOptimizationManifest,
  scenarioParameterValues: Readonly<Record<string, number>>,
): ParameterConstraintOutcome | null => {
  const constraints = constraintsInSpace(
    manifest.constraints ?? [],
    "parameters",
  );
  if (constraints.length === 0) {
    return null;
  }
  const results = evaluateParameterConstraints(constraints, {
    parameters: deriveDefaultParameterValues(
      manifest.model.definition.parameters,
    ),
    scenario: scenarioParameterValues,
  });
  const broken = results.find((result) => result.margin < 0);
  return { results, infeasible: broken?.constraintId ?? null };
};

/** The name a report gives constraint `constraintId`, or the id when the manifest does not know it. */
export const constraintNameIn = (
  manifest: Pick<PetrinautOptimizationManifest, "constraints">,
  constraintId: string,
): string => {
  const constraint = manifest.constraints?.find(
    (candidate) => candidate.id === constraintId,
  );
  return constraint ? constraintLabel(constraint) : constraintId;
};

/**
 * The auxiliary metrics a trial runs for its state constraints, one 0/1
 * indicator per constraint aggregated with `min` over each run's frames:
 * the "always" quantifier. Empty without any. Throws, naming the
 * constraint, when the emitter declines a body.
 */
export const stateConstraintMetrics = (
  manifest: PetrinautOptimizationManifest,
): DetachedObjectiveAuxiliaryMetric[] =>
  constraintsInSpace(manifest.constraints ?? [], "state").map((constraint) => {
    const artifact = compileStateConstraintIndicator(
      constraint,
      manifest.model.definition,
    );
    if (artifact === null) {
      throw new Error(
        `State constraint "${constraintLabel(constraint)}" cannot be compiled as a metric`,
      );
    }
    return {
      id: constraint.id,
      label: constraintLabel(constraint),
      artifact,
      aggregateTime: "min",
    };
  });

/**
 * Per-constraint `runsPassed` over `runsTotal` from the batch's run axis. A
 * run whose value is missing counts as failed. Empty when the batch reports
 * no run axis: nothing was observed per run.
 */
export const stateConstraintResults = (
  manifest: PetrinautOptimizationManifest,
  runResults: DetachedObjectiveRunResult["runResults"],
): PetrinautOptimizationTrialConstraints["state"] => {
  if (runResults.size === 0) {
    return [];
  }
  return constraintsInSpace(manifest.constraints ?? [], "state").map(
    (constraint) => {
      let runsPassed = 0;
      for (const values of runResults.values()) {
        const value = getOwn(values, constraint.id);
        if (value !== undefined && value >= 0.5) {
          runsPassed += 1;
        }
      }
      return {
        constraintId: constraint.id,
        runsPassed,
        runsTotal: runResults.size,
      };
    },
  );
};
