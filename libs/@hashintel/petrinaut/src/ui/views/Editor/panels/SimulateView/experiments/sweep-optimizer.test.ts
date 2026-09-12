import { describe, expect, it, vi } from "vitest";

import { synthesizeAdHocOptimization } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";

import { buildAdHocSweepAxes } from "../../../../../../react/experiments/parameter-grid";
import {
  sirOptimizationConstraints,
  sirOptimizationMetric,
  sirOptimizationScenario,
} from "../../../../../../react/optimizations/sir-optimization-input.fixtures";
import { makeExperiment } from "./experiments-story-fixtures";
import {
  buildSweepOptimizationInput,
  startSweepStudy,
  sweepOptimizationMetric,
  type SweepOptimizationExperiment,
  type SweepStudyStarter,
} from "./sweep-optimizer";

import type {
  ExperimentMetricSpecInput,
  ExperimentRecord,
} from "../../../../../../react/experiments/context";
import type {
  AdHocScenarioState,
  Metric,
  Scenario,
  SDCPN,
} from "@hashintel/petrinaut-core";

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

/** A sweep over `count` (integer) and `share` (continuous), keeping its scenario. */
const experiment = makeExperiment(1, {
  name: "Mixed sweep",
  scenarioId: scenario.id,
  scenario,
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
    experiment: { ...experiment, scenario },
    metric,
    objective: { direction: "maximize", steps: overrides.steps ?? 30 },
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
const sirExperiment: SweepOptimizationExperiment = {
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
  scenario: sirScenario,
};

const buildSir = (
  overrides: Partial<
    Pick<ExperimentRecord, "constraints" | "constraintPolicy">
  >,
) =>
  buildSweepOptimizationInput({
    title: sirModel.title,
    definition,
    experiment: { ...sirExperiment, ...overrides },
    metric: {
      id: sirOptimizationMetric.id,
      name: sirOptimizationMetric.name,
      code: sirOptimizationMetric.code,
    },
    objective: { direction: "minimize", steps: 12 },
    runsPerStep: 8,
  });

/** A one-place net for the ad-hoc definition below. */
const queueSdcpn: SDCPN = {
  places: [
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

/** The queue's count with an interval toggle on it. */
const toggledAdHocScenario: AdHocScenarioState = {
  variables: [],
  netParameters: [],
  places: {
    "place-queue": {
      kind: "uncoloured",
      count: {
        expression: "4",
        optimize: { min: "2", max: "8", scale: "linear" },
      },
    },
  },
};

/** The record `createExperiment` keeps for the toggled definition: the generated scenario and one axis per toggle. */
const adHocExperiment = (): SweepOptimizationExperiment => {
  const synthesized = synthesizeAdHocOptimization(toggledAdHocScenario, {
    netParameters: [],
    places: queueSdcpn.places,
    types: [],
  });
  if (!synthesized.ok) {
    throw new Error("The ad-hoc fixture does not synthesize");
  }
  const axes = buildAdHocSweepAxes(synthesized.output.optimizedFields);
  if (!axes.ok) {
    throw new Error(axes.error);
  }
  return {
    ...makeExperiment(2, { name: "Queue sweep", scenarioId: null }),
    scenario: synthesized.output.scenario,
    parameterAxes: axes.axes,
    scenarioParameterValues: {},
  };
};

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

  it("embeds an ad-hoc record's generated scenario and optimizes every generated parameter, fixing nothing", () => {
    const record = adHocExperiment();
    const manifest = buildSweepOptimizationInput({
      title: "Queue",
      definition: queueSdcpn,
      experiment: record,
      metric: {
        id: "queued",
        name: "Queued",
        code: "return state.places.Queue.count;",
      },
      objective: { direction: "minimize", steps: 6 },
      runsPerStep: 8,
    });

    expect(record.scenario.id).toBe("adhoc-scenario");
    expect(manifest.model.definition.scenarios).toEqual([record.scenario]);
    expect(manifest.scenario.id).toBe("adhoc-scenario");
    expect(Object.keys(manifest.scenario.parameterBindings)).toEqual([
      "adhoc_count_Queue",
    ]);
    expect(manifest.scenario.parameterBindings.adhoc_count_Queue).toEqual({
      kind: "optimize",
      domain: {
        kind: "integer",
        minimum: 2,
        maximum: 8,
        step: 1,
        scale: "linear",
      },
    });
  });
});

describe("startSweepStudy", () => {
  const spec: ExperimentMetricSpecInput = {
    kind: "expression",
    id: "infected",
    label: "Infected",
    code: metric.code,
    sampleRuns: "all",
    runOutput: { type: "distribution" },
  };
  const record: ExperimentRecord = { ...experiment, metricSpecs: [spec] };
  const fakeCreateOptimization = () =>
    vi.fn<SweepStudyStarter["createOptimization"]>(() =>
      Promise.resolve("study"),
    );
  const starter = (
    createOptimization: SweepStudyStarter["createOptimization"] = fakeCreateOptimization(),
  ): SweepStudyStarter => ({
    title: "SIR",
    definition,
    createOptimization,
  });

  it("hands the manifest and the sweep's evaluator options to the optimizations context", async () => {
    const createOptimization = fakeCreateOptimization();

    await startSweepStudy(starter(createOptimization), record, {
      metricId: "infected",
      direction: "maximize",
      steps: 30,
    });

    expect(createOptimization).toHaveBeenCalledOnce();
    const [manifest, options] = createOptimization.mock.calls[0]!;
    expect(manifest).toMatchObject({
      name: "Mixed sweep · Maximize Infected",
      execution: { seedsPerTrial: 8 },
      study: { trials: 30 },
    });
    expect(options).toEqual({
      sweep: {
        experimentId: record.id,
        axes: record.parameterAxes,
        metricId: "infected",
      },
    });
  });

  it("rejects a record without a scenario before any study exists", async () => {
    const createOptimization = fakeCreateOptimization();

    await expect(
      startSweepStudy(
        starter(createOptimization),
        { ...record, scenario: null },
        { metricId: "infected", direction: "maximize", steps: 30 },
      ),
    ).rejects.toThrow("The experiment sweeps nothing");
    expect(createOptimization).not.toHaveBeenCalled();
  });

  it("rejects a metric the experiment does not measure", async () => {
    await expect(
      startSweepStudy(starter(), record, {
        metricId: "missing",
        direction: "maximize",
        steps: 30,
      }),
    ).rejects.toThrow("Pick a metric to optimize");
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
