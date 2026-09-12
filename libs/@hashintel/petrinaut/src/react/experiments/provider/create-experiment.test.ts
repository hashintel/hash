import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PETRINAUT_EXTENSIONS } from "@hashintel/petrinaut-core";
import { sirModel } from "@hashintel/petrinaut-core/examples";
import { selectExperimentBackend } from "@hashintel/petrinaut-core/experiments";
import { createWebGpuExperimentBackend } from "@hashintel/petrinaut-core/webgpu";

import { sirOptimizationConstraints } from "../../optimizations/sir-optimization-input.fixtures";
import { experimentSdcpnWithMetrics } from "../experiment-sdcpn-with-metrics";
import {
  assertExperimentInput,
  buildSweepAxes,
  compileExperimentScenario,
  createExperimentRequestBuilder,
  newExperimentRecord,
} from "./create-experiment";

import type { CreateExperimentInput } from "../context";
import type { CompiledExperimentScenario } from "./create-experiment";
import type { Constraint, Scenario } from "@hashintel/petrinaut-core";

const span = { start: 0, length: 0 };

const parameterConstraint: Constraint = {
  space: "parameters",
  id: "cap",
  name: "Parameter constraint 1",
  code: "scenario.transmission_rate < 0.45",
  hir: {
    hirVersion: 1,
    surface: "scenario-expression",
    params: [],
    span,
    body: { kind: "boolLit", id: 0, span, value: true },
  },
};

const stateConstraint: Constraint = {
  space: "state",
  id: "infected-cap",
  name: "State constraint 1",
  code: "return state.places.Infected.count <= 900;",
  hir: {
    hirVersion: 1,
    surface: "metric",
    params: [{ name: "state", span }],
    span,
    body: { kind: "boolLit", id: 0, span, value: true },
  },
};

const input: CreateExperimentInput = {
  name: "Sweep",
  scenarioId: "scenario-swept",
  scenarioParameterValues: {},
  runCount: 8,
  seed: 1,
  dt: 0.1,
  maxTime: 10,
  metricSpecs: [
    {
      kind: "placeTokenCountMean",
      id: "infected",
      label: "Infected",
      placeId: "place__infected",
    },
  ],
};

/** A scenario with a fixed real, a swept integer and a boolean, and nothing to compile. */
const scenario: Scenario = {
  id: "scenario-swept",
  name: "Swept",
  scenarioParameters: [
    { identifier: "transmission_rate", type: "real", default: 0.3 },
    { identifier: "population", type: "integer", default: 1000 },
    { identifier: "vaccinated", type: "boolean", default: 1 },
  ],
  parameterOverrides: {},
  initialState: { type: "per_place", content: {} },
};

describe("assertExperimentInput", () => {
  it("accepts constraints with distinct ids and bodies", () => {
    expect(() =>
      assertExperimentInput({
        ...input,
        constraints: [parameterConstraint, stateConstraint],
        constraintPolicy: { alpha: 0.1 },
      }),
    ).not.toThrow();
  });

  it("rejects a constraint with a blank body", () => {
    expect(() =>
      assertExperimentInput({
        ...input,
        constraints: [{ ...parameterConstraint, code: "  " }],
      }),
    ).toThrow('Constraint "Parameter constraint 1" code is required');
  });

  it("rejects a duplicated constraint id", () => {
    expect(() =>
      assertExperimentInput({
        ...input,
        constraints: [parameterConstraint, { ...stateConstraint, id: "cap" }],
      }),
    ).toThrow('Constraint id "cap" is duplicated');
  });
});

describe("compileExperimentScenario", () => {
  const requestScenarioHir = vi.fn(() =>
    Promise.resolve({
      version: 1 as const,
      parameterOverrides: {},
      placeExpressions: {},
    }),
  );

  it("surfaces every scenario parameter's parsed value, swept ones at their fixed form", async () => {
    const { fixedValues, axes } = buildSweepAxes(scenario, {
      transmission_rate: { mode: "fixed", value: "0.4" },
      population: { mode: "range", min: 100, max: 200 },
      vaccinated: { mode: "fixed", value: "false" },
    });
    const compiled = await compileExperimentScenario({
      input: { ...input, scenarioParameterValues: {} },
      scenario,
      fixedValues,
      axes,
      sdcpn: sirModel.petriNetDefinition,
      requestScenarioHir,
    });

    expect(compiled.axes.map((axis) => axis.identifier)).toEqual([
      "population",
    ]);
    expect(compiled.fixedScenarioValues).toEqual({
      transmission_rate: 0.4,
      population: 1000,
      vaccinated: 0,
    });
  });

  it("surfaces no values for an experiment without a scenario", async () => {
    const compiled = await compileExperimentScenario({
      input: { ...input, scenarioId: null },
      scenario: null,
      fixedValues: {},
      axes: [],
      sdcpn: sirModel.petriNetDefinition,
      requestScenarioHir,
    });
    expect(compiled.fixedScenarioValues).toEqual({});
  });
});

describe("newExperimentRecord", () => {
  it("copies the constraints, the policy and the scenario values onto the record", () => {
    const record = newExperimentRecord({
      id: "experiment",
      input: {
        ...input,
        constraints: [parameterConstraint, stateConstraint],
        constraintPolicy: { alpha: 0.1 },
      },
      scenarioName: "Swept",
      axes: [],
      fixedScenarioValues: { transmission_rate: 0.4, population: 1000 },
    });

    expect(record.constraints).toEqual([parameterConstraint, stateConstraint]);
    expect(record.constraintPolicy).toEqual({ alpha: 0.1 });
    expect(record.scenarioParameterValues).toEqual({
      transmission_rate: 0.4,
      population: 1000,
    });
  });

  it("records no constraints and no policy when the input carries none", () => {
    const record = newExperimentRecord({
      id: "experiment",
      input,
      scenarioName: null,
      axes: [],
      fixedScenarioValues: {},
    });

    expect(record.constraints).toEqual([]);
    expect(record.constraintPolicy).toBeNull();
    expect(record.scenarioParameterValues).toEqual({});
  });
});

describe("createExperimentRequestBuilder", () => {
  const constrainedInput: CreateExperimentInput = {
    ...input,
    constraints: sirOptimizationConstraints,
  };
  const compiled: CompiledExperimentScenario = {
    parameterValues: {},
    initialMarking: {},
    sweptCompiler: null,
    axes: [],
    fixedScenarioValues: {},
  };
  const requestHirArtifacts = vi.fn(() =>
    Promise.resolve({
      artifacts: {
        version: 4 as const,
        fingerprint: "0000000000000000",
        dynamics: {},
        lambdas: {},
        kernels: {},
        metrics: {},
      },
      failures: [],
    }),
  );
  const sdcpn = experimentSdcpnWithMetrics(
    sirModel.petriNetDefinition,
    constrainedInput.metricSpecs,
  );
  const buildRequest = () =>
    createExperimentRequestBuilder({
      input: constrainedInput,
      sdcpn,
      extensions: DEFAULT_PETRINAUT_EXTENSIONS,
      compiled,
      requestHirArtifacts,
    });

  it("appends one indicator per state constraint after the user's metric specs, leaving the record's specs and the compiled net alone", async () => {
    const request = await buildRequest()({ needsHirTrees: false });

    expect(request.metricSpecs).toEqual([
      ...constrainedInput.metricSpecs,
      {
        kind: "expression",
        id: "constraint:infected-cap",
        label: "Infected under 900",
        code: "return state.places.Infected.count <= 900;",
        artifact: {
          source: expect.any(String) as string,
          placeNames: ["Infected"],
        },
        sampleRuns: "notErrored",
        runOutput: { type: "distribution" },
        aggregateTime: "min",
      },
    ]);
    const record = newExperimentRecord({
      id: "experiment",
      input: constrainedInput,
      scenarioName: null,
      axes: [],
      fixedScenarioValues: {},
    });
    expect(record.metricSpecs).toEqual(constrainedInput.metricSpecs);
    expect(sdcpn.metrics).toEqual([]);
  });

  it("is declined by the GPU backend naming the indicator's time aggregation", async () => {
    const selection = await selectExperimentBackend({
      registrations: [
        {
          id: "webgpu",
          label: "GPU (WebGPU)",
          // The backend is asked as if a device existed: the refusal under
          // test comes from the metric gate, before any device is touched.
          load: () =>
            Promise.resolve({
              ...createWebGpuExperimentBackend(),
              isAvailable: () => true,
            }),
        },
      ],
      buildRequest: buildRequest(),
    });

    expect(selection).toEqual({
      ok: false,
      declined: [
        {
          backendId: "webgpu",
          origin: "configuration",
          reason:
            'The GPU backend does not aggregate metrics over time yet; metric "Infected under 900" uses a time aggregation.',
        },
      ],
    });
  });
});
