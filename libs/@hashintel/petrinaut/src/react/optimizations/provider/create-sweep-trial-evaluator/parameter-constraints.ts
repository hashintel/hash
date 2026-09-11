/**
 * A trial's parameter constraints as the sweep evaluator judges them: at the
 * trial's values, before anything simulates. Everything here reports; the
 * objective is never changed by it.
 */
import {
  constraintsInSpace,
  evaluateParameterConstraints,
  type HirInterpretBindings,
  type ParameterConstraintResult,
} from "@hashintel/petrinaut-core";

import type { PetrinautOptimizationManifest } from "@hashintel/petrinaut-core/optimization";

export type ParameterConstraintOutcome = {
  results: ParameterConstraintResult[];
  /** The first constraint the draw broke, or null when every one holds. */
  infeasible: string | null;
};

/** Whether the study declares a parameter constraint, so a trial has resolved net values to check. */
export const hasParameterConstraints = (
  manifest: Pick<PetrinautOptimizationManifest, "constraints">,
): boolean =>
  constraintsInSpace(manifest.constraints ?? [], "parameters").length > 0;

/**
 * The parameter constraints' margins at the trial's point, with `parameters`
 * bound to the net parameter values the trial simulates with (the scenario's
 * overrides applied at the trial's values) and `scenario` to the trial's
 * values decoded by each scenario parameter's type, as the scenario compiler
 * binds them. Null when the manifest has no parameter constraints. Throws
 * where interpretation would.
 */
export const parameterConstraintOutcome = (
  manifest: PetrinautOptimizationManifest,
  bindings: HirInterpretBindings,
): ParameterConstraintOutcome | null => {
  const constraints = constraintsInSpace(
    manifest.constraints ?? [],
    "parameters",
  );
  if (constraints.length === 0) {
    return null;
  }
  const results = evaluateParameterConstraints(constraints, bindings);
  const broken = results.find((result) => result.margin < 0);
  return { results, infeasible: broken?.constraintId ?? null };
};
