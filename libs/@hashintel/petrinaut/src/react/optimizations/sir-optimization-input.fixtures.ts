import { petrinautOptimizationInputSchema } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

const scenario = sirModel.petriNetDefinition.scenarios?.find(
  (candidate) => candidate.id === "scenario__seasonal_flu",
);
const metric = sirModel.petriNetDefinition.metrics?.find(
  (candidate) => candidate.id === "metric__infected_fraction",
);
if (!scenario || !metric) {
  throw new Error("The SIR optimization fixtures are incomplete");
}

export const sirOptimizationScenario = scenario;
export const sirOptimizationMetric = metric;

/** A two-trial study minimizing the SIR model's infected fraction. */
export const sirOptimizationInput = petrinautOptimizationInputSchema.parse({
  kind: "petrinaut-optimization",
  version: 1,
  name: "SIR optimization",
  model: {
    title: sirModel.title,
    definition: {
      ...sirModel.petriNetDefinition,
      scenarios: [scenario],
      metrics: [metric],
    },
  },
  scenario: {
    id: scenario.id,
    parameterBindings: {
      population: { kind: "fixed", value: 1_000 },
      infected_ratio: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.001,
          maximum: 0.2,
          scale: "log",
        },
      },
    },
  },
  objective: {
    metricId: "metric__infected_fraction",
    direction: "minimize",
  },
  execution: { seed: 1, dt: 1, maxTime: 180 },
  study: { trials: 2, sampler: "tpe" },
});
