/**
 * The step line of the Constraints card: which step it describes, and the
 * words for that step's verdict.
 */
import {
  bindingStepRate,
  constraintNameIn,
  type StepVerdict,
  stepVerdict,
} from "../../../../../../../../../react/optimizations/constraint-rates";

import type { OptimizationRecord } from "../../../../../../../../../react/optimizations/context";

/**
 * The step the card describes beneath the headline: the latest step whose
 * event landed. Null before any step.
 */
export const latestStep = (
  trials: OptimizationRecord["trials"],
): OptimizationRecord["trials"][number] | null =>
  trials.reduce<OptimizationRecord["trials"][number] | null>(
    (latest, trial) =>
      latest === null || trial.trial > latest.trial ? trial : latest,
    null,
  );

/** The step line's parts: the verdict word, the `Step 12: limited` head and what follows it. */
type StepLine = {
  verdict: StepVerdict;
  head: string;
  /** The infeasible draw's constraint; the binding rate as `51 / 60 runs passed · 85% · Queue under 10`; a state other than complete; null when the head says it all. */
  detail: string | null;
};

export const describeStep = (
  input: Pick<OptimizationRecord["input"], "constraints">,
  trial: OptimizationRecord["trials"][number],
  alpha: number,
): StepLine => {
  const verdict = stepVerdict(trial, alpha);
  const head = `Step ${trial.trial + 1}: ${verdict}`;
  if (verdict === "infeasible") {
    return {
      verdict,
      head,
      detail: constraintNameIn(input, trial.constraints?.infeasible ?? ""),
    };
  }
  const binding = bindingStepRate(trial, alpha);
  if (binding === null) {
    return {
      verdict,
      head,
      detail: trial.state === "complete" ? null : trial.state,
    };
  }
  const percent = Math.round((binding.runsPassed / binding.runsTotal) * 100);
  return {
    verdict,
    head,
    detail: `${binding.runsPassed} / ${binding.runsTotal} runs passed · ${percent}% · ${constraintNameIn(input, binding.constraintId)}`,
  };
};
