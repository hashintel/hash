import { describe, expect, it } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import {
  sirOptimizationConstraints,
  sirOptimizationMetric,
  sirOptimizationScenario,
} from "../../../../../../react/optimizations/sir-optimization-input.fixtures";
import { makeExperiment } from "./experiments-story-fixtures";
import {
  buildSweepOptimizationInput,
  sweepOptimizationMetric,
} from "./sweep-optimizer";

import type {
  ExperimentMetricSpecInput,
  ExperimentRecord,
} from "../../../../../../react/experiments/context";
import type { Metric, Scenario } from "@hashintel/petrinaut-core";

const definition = sirModel.petriNetDefinition;

/** A scenario with one parameter of each binding branch. */
const scenario: Scenario = {
  id: "scenario__mixed",
  name: "Mixed",
  scenarioParameters: [
    { type: "boolean", identifier: "enabled", default: 1 },
    { type: "real", identifier: "rate", default: 0.3 },
    { type: "integer", identifier: "count", default: 5 },
    { type: "ratio", identifier: "share", default: 0.25 },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};

/** A sweep over `count` (integer) and `share` (continuous). */
const experiment = makeExperiment(1, {
  name: "Mixed sweep",
  scenarioId: scenario.id,
  seed: 42,
  dt: 0.5,
  maxTime: 20,
  parameterAxes: [
    { identifier: "count", min: 2, max: 12, stepCount: 10, integer: true },
    { identifier: "share", min: 0.1, max: 0.9, stepCount: 50, integer: false },
  ],
});

const metric: Metric = {
  id: "infected",
  name: "Infected",
  code: "return state.places.Infected.count;",
};

const build = (overrides: { steps?: number; runsPerStep?: number } = {}) =>
  buildSweepOptimizationInput({
    title: "SIR",
    definition,
    scenario,
    experiment,
    metric,
    direction: "maximize",
    steps: overrides.steps ?? 30,
    runsPerStep: overrides.runsPerStep ?? 8,
  });

/** The SIR scenario with a boolean parameter beside its integer and ratio. */
const sirScenario: Scenario = {
  ...sirOptimizationScenario,
  scenarioParameters: [
    ...sirOptimizationScenario.scenarioParameters,
    { identifier: "vaccinated", type: "boolean", default: 1 },
  ],
};

/** A sweep over the infected ratio, created with the population raised and vaccination off. */
const sirExperiment: Parameters<
  typeof buildSweepOptimizationInput
>[0]["experiment"] = {
  name: "Ratio sweep",
  seed: 7,
  dt: 0.5,
  maxTime: 90,
  parameterAxes: [
    {
      identifier: "infected_ratio",
      min: 0.001,
      max: 0.2,
      stepCount: 50,
      integer: false,
    },
  ],
  scenarioParameterValues: {
    population: 2000,
    infected_ratio: 0.01,
    vaccinated: 0,
  },
  constraints: [],
  constraintPolicy: null,
};

const buildSir = (
  overrides: Partial<
    Pick<ExperimentRecord, "constraints" | "constraintPolicy">
  >,
) =>
  buildSweepOptimizationInput({
    title: sirModel.title,
    definition,
    scenario: sirScenario,
    experiment: { ...sirExperiment, ...overrides },
    metric: {
      id: sirOptimizationMetric.id,
      name: sirOptimizationMetric.name,
      code: sirOptimizationMetric.code,
    },
    direction: "minimize",
    steps: 12,
    runsPerStep: 8,
  });

describe("buildSweepOptimizationInput", () => {
  it("fixes the parameters the sweep leaves alone at their defaults, booleans as booleans", () => {
    const input = build();

    expect(input.scenario.parameterBindings.enabled).toEqual({
      kind: "fixed",
      value: true,
    });
    expect(input.scenario.parameterBindings.rate).toEqual({
      kind: "fixed",
      value: 0.3,
    });
  });

  it("optimizes an integer axis over its interval one integer at a time", () => {
    expect(build().scenario.parameterBindings.count).toEqual({
      kind: "optimize",
      domain: {
        kind: "integer",
        minimum: 2,
        maximum: 12,
        step: 1,
        scale: "linear",
      },
    });
  });

  it("optimizes a continuous axis over its interval", () => {
    expect(build().scenario.parameterBindings.share).toEqual({
      kind: "optimize",
      domain: {
        kind: "continuous",
        minimum: 0.1,
        maximum: 0.9,
        scale: "linear",
      },
    });
  });

  it("runs each step's point for the runs per step and asks for one trial per step", () => {
    const input = build({ steps: 12, runsPerStep: 5 });

    expect(input.execution).toEqual({
      seed: 42,
      dt: 0.5,
      maxTime: 20,
      seedsPerTrial: 5,
    });
    expect(input.study).toEqual({ trials: 12, sampler: "tpe" });
    expect(input.objective).toEqual({
      metricId: "infected",
      direction: "maximize",
    });
    expect(input.name).toBe("Mixed sweep · Maximize Infected");
  });

  it("throws the schema's rejection when the steps exceed the trial cap", () => {
    expect(() => build({ steps: 1_001 })).toThrow(/trials/u);
  });

  it("fixes the non-swept parameters at the experiment's values, booleans as booleans, and sweeps the axis", () => {
    const manifest = buildSir({});

    expect(manifest.scenario.parameterBindings).toEqual({
      population: { kind: "fixed", value: 2000 },
      vaccinated: { kind: "fixed", value: false },
      infected_ratio: {
        kind: "optimize",
        domain: {
          kind: "continuous",
          minimum: 0.001,
          maximum: 0.2,
          scale: "linear",
        },
      },
    });
    expect(manifest.execution).toEqual({
      seed: 7,
      dt: 0.5,
      maxTime: 90,
      seedsPerTrial: 8,
    });
    expect(manifest.study).toMatchObject({ trials: 12 });
  });

  it("carries the experiment's constraints and pass threshold onto the manifest", () => {
    const manifest = buildSir({
      constraints: sirOptimizationConstraints,
      constraintPolicy: { alpha: 0.1 },
    });

    expect(manifest.constraints).toEqual(sirOptimizationConstraints);
    expect(manifest.constraintPolicy).toEqual({ alpha: 0.1 });
  });

  it("declares no constraints and no policy for an unconstrained sweep", () => {
    const manifest = buildSir({ constraintPolicy: { alpha: 0.1 } });

    expect(manifest).not.toHaveProperty("constraints");
    expect(manifest).not.toHaveProperty("constraintPolicy");
  });
});

describe("sweepOptimizationMetric", () => {
  const base = { id: "metric", label: "Metric" };

  it("keeps an expression metric's own code", () => {
    const spec: ExperimentMetricSpecInput = {
      ...base,
      kind: "expression",
      code: "return state.places.Infected.count * 2;",
    };

    expect(sweepOptimizationMetric(spec, definition)).toEqual({
      id: "metric",
      name: "Metric",
      code: "return state.places.Infected.count * 2;",
    });
  });

  it("reads a place count the way the metric does", () => {
    const spec: ExperimentMetricSpecInput = {
      ...base,
      kind: "placeTokenCountMean",
      placeId: "place__infected",
    };

    expect(sweepOptimizationMetric(spec, definition).code).toBe(
      "return state.places.Infected.count;",
    );
  });

  it("returns zero for a place the definition no longer has", () => {
    const spec: ExperimentMetricSpecInput = {
      ...base,
      kind: "placeTokenCountMean",
      placeId: "place__gone",
    };

    expect(sweepOptimizationMetric(spec, definition).code).toBe("return 0;");
  });

  it("stubs a transition count, which metric code cannot express", () => {
    const spec: ExperimentMetricSpecInput = {
      ...base,
      kind: "transitionFiringCount",
      transitionId: "transition__infection",
    };

    expect(sweepOptimizationMetric(spec, definition)).toEqual({
      id: "metric",
      name: "Metric",
      code: "// The sweep measures this transition count at each point.\nreturn 0;",
    });
  });
});
