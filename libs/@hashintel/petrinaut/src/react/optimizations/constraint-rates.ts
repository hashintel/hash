/**
 * Constraint verdicts read off a study's trial events, derived per render and
 * never stored: a run passes or fails a constraint, a constraint has a pass
 * rate within a step, a step is clear, limited or infeasible, and across the
 * study some share of the steps are clear. One word per level, and every
 * percentage printed beside the fraction it came from.
 */
import { constraintLabel } from "@hashintel/petrinaut-core";
import { DEFAULT_OPTIMIZATION_CONSTRAINT_ALPHA } from "@hashintel/petrinaut-core/optimization";

import type {
  PetrinautOptimizationManifest,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core/optimization";

/** The study's pass threshold: a step passes a state constraint when at least `1 - alpha` of its runs held. */
export const constraintAlpha = (
  manifest: Pick<PetrinautOptimizationManifest, "constraintPolicy">,
): number =>
  manifest.constraintPolicy?.alpha ?? DEFAULT_OPTIMIZATION_CONSTRAINT_ALPHA;

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

/** The threshold in percent, as the settings show it: 95 for alpha 0.05. */
export const passThresholdPercent = (alpha: number): number =>
  Math.round((1 - alpha) * 1000) / 10;

/** Per-run verdicts within one step: passed over total, and the step's verdict against alpha. */
export type StepConstraintRate = {
  constraintId: string;
  runsPassed: number;
  runsTotal: number;
  passed: boolean;
};

export type StepVerdict = "clear" | "limited" | "infeasible" | "unconstrained";

// A hair of slack so 57 / 60 against alpha 0.05 reads as exactly 95%.
const RATE_TOLERANCE = 1e-9;

const meetsThreshold = (
  runsPassed: number,
  runsTotal: number,
  alpha: number,
): boolean =>
  runsTotal > 0 && runsPassed / runsTotal + RATE_TOLERANCE >= 1 - alpha;

export const stepConstraintRates = (
  trial: Pick<PetrinautOptimizationTrialEvent, "constraints">,
  alpha: number,
): StepConstraintRate[] =>
  (trial.constraints?.state ?? []).map((result) => ({
    constraintId: result.constraintId,
    runsPassed: result.runsPassed,
    runsTotal: result.runsTotal,
    passed: meetsThreshold(result.runsPassed, result.runsTotal, alpha),
  }));

/**
 * The step's one-word verdict: `infeasible` when its draw broke a parameter
 * constraint, `limited` when a state constraint fell under the threshold,
 * `clear` otherwise, and `unconstrained` for a step that reported nothing.
 */
export const stepVerdict = (
  trial: Pick<PetrinautOptimizationTrialEvent, "constraints">,
  alpha: number,
): StepVerdict => {
  if (!trial.constraints) {
    return "unconstrained";
  }
  if (trial.constraints.infeasible !== undefined) {
    return "infeasible";
  }
  return stepConstraintRates(trial, alpha).every((rate) => rate.passed)
    ? "clear"
    : "limited";
};

/**
 * The step's lowest pass rate among its state constraints: the binding one,
 * which the steps table prints. Null when the step observed none.
 */
export const bindingStepRate = (
  trial: Pick<PetrinautOptimizationTrialEvent, "constraints">,
  alpha: number,
): StepConstraintRate | null => {
  let binding: StepConstraintRate | null = null;
  for (const rate of stepConstraintRates(trial, alpha)) {
    if (
      binding === null ||
      rate.runsPassed / rate.runsTotal < binding.runsPassed / binding.runsTotal
    ) {
      binding = rate;
    }
  }
  return binding;
};

/** Across the study: steps whose every state constraint passed, over steps that simulated; plus the same per constraint. */
export type StudyConstraintRates = {
  stepsClear: number;
  stepsSimulated: number;
  infeasibleDraws: number;
  perConstraint: {
    constraintId: string;
    stepsPassed: number;
    stepsSimulated: number;
  }[];
};

/**
 * Derived from the trials alone, so it survives a resume and never drifts
 * from what the table shows. A step simulated when its draw was feasible and
 * its batch completed; a pruned batch observed nothing and counts nowhere.
 */
export const studyConstraintRates = (
  trials: readonly PetrinautOptimizationTrialEvent[],
  alpha: number,
): StudyConstraintRates => {
  const perConstraint = new Map<
    string,
    { stepsPassed: number; stepsSimulated: number }
  >();
  let stepsClear = 0;
  let stepsSimulated = 0;
  let infeasibleDraws = 0;
  for (const trial of trials) {
    const verdict = stepVerdict(trial, alpha);
    if (verdict === "unconstrained") {
      continue;
    }
    if (verdict === "infeasible") {
      infeasibleDraws += 1;
      continue;
    }
    if (trial.state !== "complete") {
      continue;
    }
    stepsSimulated += 1;
    if (verdict === "clear") {
      stepsClear += 1;
    }
    for (const rate of stepConstraintRates(trial, alpha)) {
      const entry = perConstraint.get(rate.constraintId) ?? {
        stepsPassed: 0,
        stepsSimulated: 0,
      };
      entry.stepsSimulated += 1;
      if (rate.passed) {
        entry.stepsPassed += 1;
      }
      perConstraint.set(rate.constraintId, entry);
    }
  }
  return {
    stepsClear,
    stepsSimulated,
    infeasibleDraws,
    perConstraint: [...perConstraint].map(([constraintId, entry]) => ({
      constraintId,
      ...entry,
    })),
  };
};

/** "52 / 60 · 87%": the fraction first, the percentage beside it; no percentage over nothing. */
export const formatRate = (passed: number, total: number): string =>
  total > 0
    ? `${passed} / ${total} · ${Math.round((passed / total) * 100)}%`
    : `${passed} / ${total}`;
