import type {
  PetrinautOptimizationTrialConstraints,
  PetrinautOptimizationTrialOutcome,
} from "@hashintel/petrinaut-core/optimization";

/** A trial the optimizer should prune, with the reason and any constraints the batch still measured. */
export const prunedTrialOutcome = (
  reason: string,
  constraints?: PetrinautOptimizationTrialConstraints,
): PetrinautOptimizationTrialOutcome => ({
  kind: "pruned",
  reason,
  ...(constraints ? { constraints } : {}),
});
