import {
  type Constraint,
  type ConstraintSource,
  petrinautOptimizationInputSchema,
  type Scenario,
} from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import { lowerConstraint } from "@hashintel/petrinaut-core/hir";

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

const lowerSirConstraint = (
  source: ConstraintSource,
  overScenario: Scenario = scenario,
): Constraint => {
  const lowered = lowerConstraint(source, {
    netParameters: sirModel.petriNetDefinition.parameters,
    scenarioParameters: overScenario.scenarioParameters,
    sdcpn: sirModel.petriNetDefinition,
  });
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics[0]?.message ?? "constraint");
  }
  return lowered.constraint;
};

/** One parameter constraint and one state constraint over the SIR study. */
export const sirOptimizationConstraints: Constraint[] = [
  lowerSirConstraint({
    space: "parameters",
    id: "ratio-cap",
    name: "Ratio under a tenth",
    code: "scenario.infected_ratio <= 0.1",
  }),
  lowerSirConstraint({
    space: "state",
    id: "infected-cap",
    name: "Infected under 900",
    code: "return state.places.Infected.count <= 900;",
  }),
];

/** The SIR study with both constraints declared and the default policy. */
export const sirConstrainedOptimizationInput =
  petrinautOptimizationInputSchema.parse({
    ...sirOptimizationInput,
    constraints: sirOptimizationConstraints,
  });

/** The seasonal flu scenario with the net's infection rate rebound to twenty times the infected ratio. */
export const sirOverridingOptimizationScenario: Scenario = {
  ...scenario,
  parameterOverrides: {
    ...scenario.parameterOverrides,
    param__infection_rate: "scenario.infected_ratio * 20",
  },
};

/**
 * The SIR study on the overriding scenario with one constraint over the net
 * parameter: `parameters.infection_rate <= 2` holds at an infected ratio of
 * 0.05 (rate 1) and breaks at 0.15 (rate 3), while the net's default of 3
 * would break it at every draw.
 */
export const sirNetConstrainedOptimizationInput =
  petrinautOptimizationInputSchema.parse({
    ...sirOptimizationInput,
    model: {
      ...sirOptimizationInput.model,
      definition: {
        ...sirOptimizationInput.model.definition,
        scenarios: [sirOverridingOptimizationScenario],
      },
    },
    constraints: [
      lowerSirConstraint({
        space: "parameters",
        id: "rate-cap",
        name: "Infection rate under two",
        code: "parameters.infection_rate <= 2",
      }),
    ],
  });

/** The seasonal flu scenario with an `isolation` switch beside its numeric parameters. */
export const sirSwitchedOptimizationScenario: Scenario = {
  ...scenario,
  scenarioParameters: [
    ...scenario.scenarioParameters,
    { type: "boolean", identifier: "isolation", default: 0 },
  ],
};

/**
 * The SIR study on the switched scenario, optimizing the switch under one
 * constraint that requires it on: `scenario.isolation == true` holds for a
 * true draw and breaks for a false one.
 */
export const sirSwitchConstrainedOptimizationInput =
  petrinautOptimizationInputSchema.parse({
    ...sirOptimizationInput,
    model: {
      ...sirOptimizationInput.model,
      definition: {
        ...sirOptimizationInput.model.definition,
        scenarios: [sirSwitchedOptimizationScenario],
      },
    },
    scenario: {
      ...sirOptimizationInput.scenario,
      parameterBindings: {
        ...sirOptimizationInput.scenario.parameterBindings,
        isolation: { kind: "optimize", domain: { kind: "boolean" } },
      },
    },
    constraints: [
      lowerSirConstraint(
        {
          space: "parameters",
          id: "isolation-on",
          name: "Isolation on",
          code: "scenario.isolation == true",
        },
        sirSwitchedOptimizationScenario,
      ),
    ],
  });
