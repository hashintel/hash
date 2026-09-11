import { expect, it } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { prepareExperiment } from "./prepare-experiment";

it.each(["simulate", "optimize"] as const)(
  "retains selected metric distributions for %s requests",
  (mode) => {
    const { input } = prepareExperiment(
      {
        name: "SIR experiment",
        scenarioId: "scenario__seasonal_flu",
        scenarioParameterValues:
          mode === "optimize"
            ? { infected_ratio: { mode: "range", min: 0.01, max: 0.1 } }
            : {},
        runCount: 25,
        seed: 42,
        dt: 1,
        maxTime: 10,
        metricIds: ["metric__infected_fraction"],
        execution:
          mode === "optimize"
            ? {
                mode,
                objectiveMetricId: "metric__infected_fraction",
                direction: "minimize",
                steps: 3,
                runsPerStep: 8,
              }
            : { mode },
      },
      sirModel.petriNetDefinition,
      sirModel.title,
    );
    expect(input.metricSpecs).toEqual([
      {
        id: "metric__infected_fraction",
        label: sirModel.petriNetDefinition.metrics![0]!.name,
        kind: "expression",
        code: sirModel.petriNetDefinition.metrics![0]!.code,
        sampleRuns: "all",
        runOutput: { type: "distribution" },
      },
    ]);
  },
);

it("selects one scenario and objective from a model with several scenarios and metrics", () => {
  const definition = structuredClone(sirModel.petriNetDefinition);
  definition.metrics = [
    ...(definition.metrics ?? []),
    {
      id: "population",
      name: "Population",
      code: "return state.places.Susceptible.count;",
    },
  ];
  const { input, optimization } = prepareExperiment(
    {
      name: "SIR optimization",
      scenarioId: "scenario__seasonal_flu",
      scenarioParameterValues: {
        population: { mode: "fixed", value: 100 },
        infected_ratio: { mode: "range", min: 0.01, max: 0.1 },
      },
      runCount: 25,
      seed: 42,
      dt: 1,
      maxTime: 10,
      metricIds: ["metric__infected_fraction", "population"],
      execution: {
        mode: "optimize",
        objectiveMetricId: "metric__infected_fraction",
        direction: "minimize",
        steps: 3,
        runsPerStep: 8,
      },
    },
    definition,
    sirModel.title,
  );

  expect(input.metricSpecs.map((metric) => metric.id)).toEqual([
    "metric__infected_fraction",
    "population",
  ]);
  expect(
    optimization?.model.definition.scenarios?.map((scenario) => scenario.id),
  ).toEqual(["scenario__seasonal_flu"]);
  expect(
    optimization?.model.definition.metrics?.map((metric) => metric.id),
  ).toEqual(["metric__infected_fraction"]);
  expect(definition.scenarios).toHaveLength(4);
  expect(definition.metrics).toHaveLength(2);
});
