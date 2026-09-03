import { petrinautOptimizationManifestSchema } from "../optimization";

import type { PetrinautOptimizationManifest } from "../optimization";

const scenario = {
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
};

/**
 * A study over two optimized numeric parameters and one optimized boolean,
 * with one fixed ratio: enough to exercise every describe and resolve branch.
 */
export const createOptimizationManifestInput = () => ({
  kind: "petrinaut-optimization" as const,
  version: 1 as const,
  name: "Find the best rate",
  model: {
    title: "Example",
    definition: {
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      subnets: [],
      componentInstances: [],
      scenarios: [scenario],
      metrics: [{ id: "profit", name: "Profit", code: "return 1;" }],
    },
  },
  scenario: {
    id: "baseline",
    parameterBindings: {
      rate: {
        kind: "optimize" as const,
        domain: {
          kind: "continuous" as const,
          minimum: 0.1,
          maximum: 2,
          scale: "log" as const,
        },
      },
      count: {
        kind: "optimize" as const,
        domain: {
          kind: "integer" as const,
          minimum: 2,
          maximum: 10,
          step: 2,
          scale: "linear" as const,
        },
      },
      enabled: {
        kind: "optimize" as const,
        domain: { kind: "boolean" as const },
      },
      share: { kind: "fixed" as const, value: 0.25 },
    },
  },
  objective: { metricId: "profit", direction: "maximize" as const },
  execution: { seed: 42, dt: 0.1, maxTime: 100 },
  study: { trials: 20, sampler: "tpe" as const },
});

export const createOptimizationManifest = (
  overrides: Record<string, unknown> = {},
): PetrinautOptimizationManifest =>
  petrinautOptimizationManifestSchema.parse({
    ...createOptimizationManifestInput(),
    ...overrides,
  });
