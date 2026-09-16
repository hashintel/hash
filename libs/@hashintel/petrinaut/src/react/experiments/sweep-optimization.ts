import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core/optimization";

import type { ExperimentRecord } from "./context";
import type {
  Metric,
  Scenario,
  ScenarioParameter,
  SDCPN,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core/optimization";

/** What the manifest reads of the experiment: its execution, axes, constraints and the scenario it compiled. */
export type SweepOptimizationExperiment = Pick<
  ExperimentRecord,
  | "name"
  | "seed"
  | "dt"
  | "maxTime"
  | "parameterAxes"
  | "scenarioParameterValues"
  | "constraints"
  | "constraintPolicy"
> & { scenario: Scenario };

/**
 * The manifest of a study searching the experiment's swept axes for the best
 * value of one of its metrics. Bindings come from `experiment.scenario`: an
 * axis is an optimize binding over its interval, every other parameter is
 * fixed at the value the experiment was created with, so the trials' values
 * — which the evaluator judges the experiment's parameter constraints
 * against — match what the sweep simulates. An ad-hoc record's generated
 * scenario has only axes, so every binding is optimize. The experiment's
 * constraints and pass threshold ride the manifest as they are. Throws with
 * the schema's message when the experiment cannot be a study (a step budget
 * over the cap, say).
 */
export const buildSweepOptimizationInput = ({
  title,
  definition,
  experiment,
  name = experiment.name,
  metric,
  objective,
  runsPerStep,
}: {
  title: string;
  definition: SDCPN;
  experiment: SweepOptimizationExperiment;
  name?: string;
  metric: Metric;
  objective: { direction: PetrinautOptimizationDirection; steps: number };
  /** Runs each point computes before its value is read. */
  runsPerStep: number;
}): PetrinautOptimizationInput => {
  const { scenario } = experiment;
  const fixedValueFor = (parameter: ScenarioParameter): number | boolean => {
    const value =
      experiment.scenarioParameterValues[parameter.identifier] ??
      parameter.default;
    return parameter.type === "boolean" ? value !== 0 : value;
  };
  const parameterBindings: Record<
    string,
    PetrinautOptimizationParameterBinding
  > = {};
  for (const parameter of scenario.scenarioParameters) {
    const axis = experiment.parameterAxes.find(
      (candidate) => candidate.identifier === parameter.identifier,
    );
    if (axis === undefined) {
      parameterBindings[parameter.identifier] = {
        kind: "fixed",
        value: fixedValueFor(parameter),
      };
    } else if (axis.integer) {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "integer",
          minimum: axis.min,
          maximum: axis.max,
          step: 1,
          scale: "linear",
        },
      };
    } else {
      parameterBindings[parameter.identifier] = {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: axis.min,
          maximum: axis.max,
          scale: "linear",
        },
      };
    }
  }
  const { constraints, constraintPolicy } = experiment;
  return petrinautOptimizationInputSchema.parse({
    kind: "petrinaut-optimization",
    version: 1,
    name,
    model: {
      title,
      definition: { ...definition, scenarios: [scenario], metrics: [metric] },
    },
    scenario: { id: scenario.id, parameterBindings },
    objective: { metricId: metric.id, direction: objective.direction },
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(constraints.length > 0 && constraintPolicy ? { constraintPolicy } : {}),
    execution: {
      seed: experiment.seed,
      dt: experiment.dt,
      maxTime: experiment.maxTime,
      seedsPerTrial: runsPerStep,
    },
    study: { trials: objective.steps, sampler: "tpe" },
  });
};
