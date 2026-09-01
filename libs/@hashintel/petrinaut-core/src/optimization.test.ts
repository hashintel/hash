import { describe, expect, it } from "vitest";

import {
  petrinautOptimizationEventSchema,
  petrinautOptimizationManifestSchema,
} from "./optimization";

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

const definition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  subnets: [],
  componentInstances: [],
  scenarios: [scenario],
  metrics: [{ id: "profit", name: "Profit", code: "return 1;" }],
  statusViews: [],
};

const validManifest = {
  kind: "petrinaut-optimization" as const,
  version: 1 as const,
  name: "Find the best rate",
  model: { title: "Example", definition },
  scenario: {
    id: "baseline",
    parameterBindings: {
      rate: {
        kind: "optimize" as const,
        domain: {
          kind: "continuous" as const,
          minimum: 0.1,
          maximum: 2,
          scale: "linear" as const,
        },
      },
      count: { kind: "fixed" as const, value: 10 },
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
};

describe("petrinautOptimizationManifestSchema", () => {
  it("accepts an exhaustive flat scenario-parameter manifest", () => {
    expect(petrinautOptimizationManifestSchema.parse(validManifest)).toEqual(
      validManifest,
    );
  });

  it("requires exactly one selected scenario and objective metric", () => {
    const extraScenario = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      model: {
        ...validManifest.model,
        definition: {
          ...definition,
          scenarios: [scenario, { ...scenario, id: "other" }],
        },
      },
    });
    const missingMetric = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      model: {
        ...validManifest.model,
        definition: { ...definition, metrics: [] },
      },
    });

    expect(extraScenario.success).toBe(false);
    expect(missingMetric.success).toBe(false);
  });

  it("requires custom expression code on the objective metric", () => {
    const blankCode = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      model: {
        ...validManifest.model,
        definition: {
          ...definition,
          metrics: [{ id: "profit", name: "Profit", code: "   " }],
        },
      },
    });
    const missingCode = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      model: {
        ...validManifest.model,
        definition: {
          ...definition,
          metrics: [{ id: "profit", name: "Profit" }],
        },
      },
    });

    expect(blankCode.success).toBe(false);
    expect(missingCode.success).toBe(false);
    if (!blankCode.success) {
      expect(blankCode.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["model", "definition", "metrics", 0, "code"],
        }),
      );
    }
  });

  it("requires a binding for every and only scenario parameter", () => {
    const missing = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          count: undefined,
        },
      },
    });
    const unknown = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          unknown: { kind: "fixed", value: 1 },
        },
      },
    });

    expect(missing.success).toBe(false);
    expect(unknown.success).toBe(false);
  });

  // A binding named "constructor" previously exercised the binding check's
  // own-property semantics; the model boundary now rejects the identifier
  // before the binding check runs.
  it("rejects reserved-name scenario parameters at the model boundary", () => {
    const parsed = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      model: {
        ...validManifest.model,
        definition: {
          ...definition,
          scenarios: [
            {
              ...scenario,
              scenarioParameters: [
                { identifier: "constructor", type: "real", default: 1 },
              ],
            },
          ],
        },
      },
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {},
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["model"],
          message: expect.stringContaining(
            'scenario parameter identifier "constructor"',
          ) as string,
        }),
      );
    }
  });

  it("matches fixed values and optimization domains to parameter types", () => {
    const invalid = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          count: { kind: "fixed", value: 1.5 },
          enabled: {
            kind: "optimize",
            domain: {
              kind: "continuous",
              minimum: 0,
              maximum: 1,
              scale: "linear",
            },
          },
          share: { kind: "fixed", value: 2 },
        },
      },
    });

    expect(invalid.success).toBe(false);
  });

  it("constrains ratio domains and logarithmic ranges", () => {
    const ratio = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          share: {
            kind: "optimize",
            domain: {
              kind: "continuous",
              minimum: -1,
              maximum: 2,
              scale: "linear",
            },
          },
        },
      },
    });
    const logarithmic = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          rate: {
            kind: "optimize",
            domain: {
              kind: "continuous",
              minimum: 0,
              maximum: 2,
              scale: "log",
            },
          },
        },
      },
    });

    expect(ratio.success).toBe(false);
    expect(logarithmic.success).toBe(false);
  });

  it("requires an integer step to land exactly on the maximum", () => {
    const parsed = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          count: {
            kind: "optimize",
            domain: {
              kind: "integer",
              minimum: 2,
              maximum: 10,
              step: 3,
              scale: "linear",
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["scenario", "parameterBindings", "count", "domain", "step"],
          message:
            "Step must divide the range exactly so the maximum is reachable",
        }),
      );
    }
  });

  it("requires logarithmic integer domains to be positive with unit steps", () => {
    const nonPositive = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          count: {
            kind: "optimize",
            domain: {
              kind: "integer",
              minimum: 0,
              maximum: 10,
              step: 1,
              scale: "log",
            },
          },
        },
      },
    });
    const stepped = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          ...validManifest.scenario.parameterBindings,
          count: {
            kind: "optimize",
            domain: {
              kind: "integer",
              minimum: 2,
              maximum: 10,
              step: 2,
              scale: "log",
            },
          },
        },
      },
    });

    expect(nonPositive.success).toBe(false);
    expect(stepped.success).toBe(false);
  });

  it("requires at least one optimized parameter", () => {
    const parsed = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      scenario: {
        ...validManifest.scenario,
        parameterBindings: {
          rate: { kind: "fixed", value: 0.5 },
          count: { kind: "fixed", value: 10 },
          enabled: { kind: "fixed", value: true },
          share: { kind: "fixed", value: 0.25 },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("bounds seeds and total simulation work", () => {
    const invalidSeed = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, seed: -1 },
    });
    const tooManySteps = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, dt: 0.000_001, maxTime: 100 },
    });
    const tooMuchTotalWork = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, dt: 0.001, maxTime: 10 },
      study: { ...validManifest.study, trials: 1_000 },
    });

    expect(invalidSeed.success).toBe(false);
    expect(tooManySteps.success).toBe(false);
    expect(tooMuchTotalWork.success).toBe(false);
  });

  it("bounds the seeds each trial may run", () => {
    const withSeeds = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, seedsPerTrial: 10 },
    });
    const zeroSeeds = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, seedsPerTrial: 0 },
    });
    const fractionalSeeds = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, seedsPerTrial: 1.5 },
    });
    const tooManySeeds = petrinautOptimizationManifestSchema.safeParse({
      ...validManifest,
      execution: { ...validManifest.execution, seedsPerTrial: 101 },
    });

    expect(withSeeds.success).toBe(true);
    expect(zeroSeeds.success).toBe(false);
    expect(fractionalSeeds.success).toBe(false);
    expect(tooManySeeds.success).toBe(false);
  });

  it("counts every trial seed against the total work budget", () => {
    // 1,000 steps x 100 trials fits the 5,000,000-step budget with one seed
    // per trial but exceeds it with one hundred.
    const base = {
      ...validManifest,
      execution: { ...validManifest.execution, dt: 0.1, maxTime: 100 },
      study: { ...validManifest.study, trials: 100 },
    };
    const singleSeed = petrinautOptimizationManifestSchema.safeParse(base);
    const replicated = petrinautOptimizationManifestSchema.safeParse({
      ...base,
      execution: { ...base.execution, seedsPerTrial: 100 },
    });

    expect(singleSeed.success).toBe(true);
    expect(replicated.success).toBe(false);
    if (!replicated.success) {
      expect(replicated.error.issues[0]?.path).toEqual([
        "execution",
        "seedsPerTrial",
      ]);
    }

    // A workload that overflows even unseeded stays a trial-count issue.
    const oversizedUnseeded = petrinautOptimizationManifestSchema.safeParse({
      ...base,
      execution: { ...base.execution, dt: 0.001, seedsPerTrial: 2 },
    });
    expect(oversizedUnseeded.success).toBe(false);
    if (!oversizedUnseeded.success) {
      expect(oversizedUnseeded.error.issues[0]?.path).toEqual([
        "study",
        "trials",
      ]);
    }
  });
});

describe("petrinautOptimizationEventSchema", () => {
  const events = [
    { type: "started", requestedTrials: 2 },
    {
      type: "trial",
      trial: 0,
      parameters: { rate: 0.5 },
      objective: 1,
      state: "complete",
      best: { trial: 0, parameters: { rate: 0.5 }, objective: 1 },
    },
    {
      type: "complete",
      requestedTrials: 2,
      completedTrials: 2,
      prunedTrials: 0,
      failedTrials: 0,
      best: null,
    },
    { type: "error", code: "failed", message: "nope", retryable: false },
  ];

  it("accepts events with and without a sequence number on every variant", () => {
    for (const [index, event] of events.entries()) {
      const withoutSeq = petrinautOptimizationEventSchema.safeParse(event);
      const withSeq = petrinautOptimizationEventSchema.safeParse({
        ...event,
        seq: index + 1,
      });

      expect(withoutSeq.success).toBe(true);
      expect(withSeq.success).toBe(true);
      if (withSeq.success) {
        expect(withSeq.data.seq).toBe(index + 1);
      }
    }
  });

  it("rejects negative or fractional sequence numbers", () => {
    const negative = petrinautOptimizationEventSchema.safeParse({
      type: "started",
      requestedTrials: 2,
      seq: -1,
    });
    const fractional = petrinautOptimizationEventSchema.safeParse({
      type: "started",
      requestedTrials: 2,
      seq: 1.5,
    });

    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
  });
});
