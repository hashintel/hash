import { describe, expect, it } from "vitest";

import { petrinautOptimizationInputSchema } from "./optimization";

const model = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  subnets: [],
  componentInstances: [],
  scenarios: [
    {
      id: "baseline",
      name: "Baseline",
      scenarioParameters: [
        { identifier: "rate", type: "real" as const, default: 0.5 },
        { identifier: "count", type: "integer" as const, default: 10 },
        { identifier: "enabled", type: "boolean" as const, default: 1 },
        { identifier: "share", type: "ratio" as const, default: 0.25 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place" as const, content: {} },
    },
  ],
  metrics: [{ id: "profit", name: "Profit", code: "return 1;" }],
};

const validInput = {
  name: "Find the best rate",
  model: { title: "Example", definition: model },
  scenario: {
    id: "baseline",
    parameterValues: { rate: 0.5, count: 10, enabled: true, share: 0.25 },
  },
  searchSpace: {
    version: 1 as const,
    variables: [
      {
        identifier: "rate",
        domain: {
          kind: "continuous" as const,
          minimum: 0.1,
          maximum: 2,
          scale: "linear" as const,
        },
      },
    ],
  },
  objective: { metricId: "profit", direction: "maximize" as const },
  execution: { seed: 42, dt: 0.1, maxTime: 100 },
  optimization: { trials: 20, sampler: "tpe" as const },
};

describe("petrinautOptimizationInputSchema", () => {
  it("accepts a flat scenario-parameter search space", () => {
    expect(petrinautOptimizationInputSchema.parse(validInput)).toEqual(
      validInput,
    );
  });

  it("rejects a missing scenario", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      scenario: { ...validInput.scenario, id: "missing" },
    });

    expect(parsed.success).toBe(false);
  });

  it("requires a value for every scenario parameter", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      scenario: {
        ...validInput.scenario,
        parameterValues: { rate: 0.5 },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects incompatible and duplicate search variables", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      searchSpace: {
        version: 1,
        variables: [
          {
            identifier: "count",
            domain: {
              kind: "continuous",
              minimum: 1,
              maximum: 20,
              scale: "linear",
            },
          },
          {
            identifier: "count",
            domain: { kind: "integer", minimum: 1, maximum: 20, step: 1 },
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("constrains ratio and boolean domains", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      searchSpace: {
        version: 1,
        variables: [
          {
            identifier: "share",
            domain: {
              kind: "continuous",
              minimum: -1,
              maximum: 2,
              scale: "linear",
            },
          },
          {
            identifier: "enabled",
            domain: { kind: "categorical", values: [false, 2] },
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("requires an integer step to land exactly on the maximum", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      searchSpace: {
        version: 1,
        variables: [
          {
            identifier: "count",
            domain: { kind: "integer", minimum: 2, maximum: 10, step: 3 },
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["searchSpace", "variables", 0, "domain", "step"],
          message:
            "Step must divide the range exactly so the maximum is reachable",
        }),
      );
    }
  });

  it("rejects a boolean value for a real parameter", () => {
    const parsed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      scenario: {
        ...validInput.scenario,
        parameterValues: {
          ...validInput.scenario.parameterValues,
          rate: true,
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("bounds seeds and total simulation work", () => {
    const invalidSeed = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      execution: { ...validInput.execution, seed: -1 },
    });
    const tooManySteps = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      execution: { ...validInput.execution, dt: 0.000_001, maxTime: 100 },
    });
    const tooMuchTotalWork = petrinautOptimizationInputSchema.safeParse({
      ...validInput,
      execution: { ...validInput.execution, dt: 0.001, maxTime: 10 },
      optimization: { ...validInput.optimization, trials: 1_000 },
    });

    expect(invalidSeed.success).toBe(false);
    expect(tooManySteps.success).toBe(false);
    expect(tooMuchTotalWork.success).toBe(false);
  });
});
