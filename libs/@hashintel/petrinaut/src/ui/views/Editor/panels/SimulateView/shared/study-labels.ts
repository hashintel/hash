/**
 * The words a study is named by: the scenario it runs, the metric it
 * optimizes and which way. Each falls back to the raw identifier when the
 * frozen model no longer knows the entity, so a title never goes blank.
 */
import type { Metric } from "@hashintel/petrinaut-core";
import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core/optimization";

/** The objective's metric as the frozen model defines it; undefined when the model lost it. */
export const objectiveMetric = (
  input: Pick<PetrinautOptimizationInput, "model" | "objective">,
): Metric | undefined =>
  input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );

/** The objective metric's name, or its id. */
export const objectiveMetricName = (
  input: Pick<PetrinautOptimizationInput, "model" | "objective">,
): string => objectiveMetric(input)?.name ?? input.objective.metricId;

/** The study's scenario's name, or its id. */
export const scenarioName = (
  input: Pick<PetrinautOptimizationInput, "model" | "scenario">,
): string =>
  input.model.definition.scenarios?.find(
    (candidate) => candidate.id === input.scenario.id,
  )?.name ?? input.scenario.id;

/** `Maximize` or `Minimize`, as titles and readouts spell the direction. */
export const directionWord = (
  direction: PetrinautOptimizationInput["objective"]["direction"],
): "Maximize" | "Minimize" =>
  direction === "maximize" ? "Maximize" : "Minimize";
