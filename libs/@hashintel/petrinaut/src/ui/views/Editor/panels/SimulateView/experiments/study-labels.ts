/**
 * The words a study is named by: the metric it optimizes and which way. The
 * metric falls back to its raw identifier when the frozen model no longer
 * knows it, so a title never goes blank.
 */
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core/optimization";

/** The objective metric's name as the frozen model defines it, or its id. */
export const objectiveMetricName = (
  input: Pick<PetrinautOptimizationInput, "model" | "objective">,
): string =>
  input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  )?.name ?? input.objective.metricId;

/** `Maximize` or `Minimize`, as titles and readouts spell the direction. */
export const directionWord = (
  direction: PetrinautOptimizationDirection,
): "Maximize" | "Minimize" =>
  direction === "maximize" ? "Maximize" : "Minimize";
