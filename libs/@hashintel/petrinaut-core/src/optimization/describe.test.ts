import { describe, expect, it } from "vitest";

import { createOptimizationManifest } from "../shared/optimization-manifest.fixtures";
import {
  deriveOptimizationTrialSeeds,
  describeOptimization,
  resolveTrialScenarioParameterValues,
} from "./describe";

describe("describeOptimization", () => {
  it("reports the direction, the seeded study and only the optimized parameters", () => {
    const manifest = createOptimizationManifest();

    expect(describeOptimization(manifest)).toEqual({
      direction: "maximize",
      study: { trials: 20, sampler: "tpe", seed: 42, seedsPerTrial: 1 },
      parameters: [
        {
          identifier: "rate",
          type: "float",
          default: 0.5,
          minimum: 0.1,
          maximum: 2,
          scale: "log",
        },
        {
          identifier: "count",
          type: "int",
          default: 10,
          minimum: 2,
          maximum: 10,
          step: 2,
          scale: "linear",
        },
        { identifier: "enabled", type: "boolean", default: true },
      ],
    });
  });

  it("passes the configured seeds per trial through", () => {
    const manifest = createOptimizationManifest({
      execution: { seed: 7, dt: 0.1, maxTime: 100, seedsPerTrial: 3 },
    });

    expect(describeOptimization(manifest).study).toEqual({
      trials: 20,
      sampler: "tpe",
      seed: 7,
      seedsPerTrial: 3,
    });
  });
});

describe("deriveOptimizationTrialSeeds", () => {
  it("keeps the base seed first and derives the documented sequence", () => {
    expect(deriveOptimizationTrialSeeds(42, 1)).toEqual([42]);
    expect(deriveOptimizationTrialSeeds(42, 2)).toEqual([42, 1_013_904_268]);

    const seeds = deriveOptimizationTrialSeeds(42, 100);
    expect(new Set(seeds).size).toBe(100);
    for (const seed of seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(2_147_483_647);
    }
  });
});

describe("resolveTrialScenarioParameterValues", () => {
  const manifest = createOptimizationManifest();

  it("merges fixed bindings with the suggestions and encodes booleans as 0/1", () => {
    expect(
      resolveTrialScenarioParameterValues(manifest, {
        rate: 1.5,
        count: 6,
        enabled: false,
      }),
    ).toEqual({ rate: 1.5, count: 6, enabled: 0, share: 0.25 });
    expect(
      resolveTrialScenarioParameterValues(manifest, {
        rate: 0.1,
        count: 10,
        enabled: true,
      }).enabled,
    ).toBe(1);
  });

  it("requires every and only optimized value", () => {
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, { rate: 1, count: 2 }),
    ).toThrow('Missing optimized parameter "enabled"');
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: 1,
        count: 2,
        enabled: true,
        share: 0.5,
      }),
    ).toThrow('Unexpected optimization parameter "share"');
  });

  it("validates each suggestion against its domain", () => {
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: 3,
        count: 2,
        enabled: true,
      }),
    ).toThrow('Optimization parameter "rate" must be between 0.1 and 2');
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: 1,
        count: 5,
        enabled: true,
      }),
    ).toThrow('Optimization parameter "count" must align with step 2 from 2');
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: 1,
        count: 2.5,
        enabled: true,
      }),
    ).toThrow('Optimization parameter "count" must be an integer');
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: 1,
        count: 2,
        enabled: 1,
      }),
    ).toThrow('Optimization parameter "enabled" must be boolean');
    expect(() =>
      resolveTrialScenarioParameterValues(manifest, {
        rate: true,
        count: 2,
        enabled: true,
      }),
    ).toThrow('Optimization parameter "rate" must be numeric');
  });
});
