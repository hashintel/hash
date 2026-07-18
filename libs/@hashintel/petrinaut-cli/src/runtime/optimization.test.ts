import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  createOptimizationProtocol,
  loadOptimizationManifest,
  parseOptimizationManifest,
} from "./optimization";

import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

const modelPath = fileURLToPath(
  new URL("../../examples/sir-model.json", import.meta.url),
);
const supplyChainOptimizationPath = fileURLToPath(
  new URL(
    "../../examples/supply-chain-profit-optimization.json",
    import.meta.url,
  ),
);

async function createManifest() {
  const legacyModel = JSON.parse(await readFile(modelPath, "utf8")) as {
    title: string;
    scenarios: { id: string }[];
    metrics: { id: string; name: string }[];
    [key: string]: unknown;
  };
  const { title, ...definition } = legacyModel;
  return parseOptimizationManifest({
    kind: "petrinaut-optimization",
    version: 1,
    name: "Minimize infected fraction",
    model: {
      title,
      definition: {
        ...definition,
        scenarios: [legacyModel.scenarios[0]],
        metrics: [legacyModel.metrics[0]],
      },
    },
    scenario: {
      id: "scenario__seasonal_flu",
      parameterBindings: {
        population: { kind: "fixed", value: 200 },
        infected_ratio: {
          kind: "optimize",
          domain: {
            kind: "continuous",
            minimum: 0.01,
            maximum: 0.5,
            scale: "log",
          },
        },
      },
    },
    objective: {
      metricId: "metric__infected_fraction",
      direction: "minimize",
    },
    execution: { seed: 42, dt: 0.1, maxTime: 10 },
    study: { trials: 20, sampler: "tpe" },
  });
}

describe("createOptimizationProtocol", () => {
  it("executes the checked-in supply-chain optimization manifest", async () => {
    const manifest = await loadOptimizationManifest(
      supplyChainOptimizationPath,
    );
    const run = vi.fn(() => ({
      seed: 1234,
      status: "complete" as const,
      completionReason: "maxTime" as const,
      frameCount: 101,
      finalTime: 10,
      finalPlaceTokenCounts: {},
      metrics: { Profit: 42 },
    }));
    const model: PetrinautCompiledModel = {
      metadata: { parameters: [], places: [], metrics: [] },
      run,
    };
    const protocol = createOptimizationProtocol({ manifest, model });

    expect(protocol.describe()).toEqual({
      direction: "maximize",
      study: { trials: 1_000, sampler: "tpe", seed: 1234 },
      parameters: [
        {
          identifier: "production_rate",
          type: "float",
          default: 100,
          minimum: 20,
          maximum: 250,
          scale: "linear",
        },
        {
          identifier: "reorder_threshold",
          type: "int",
          default: 160,
          minimum: 81,
          maximum: 1_000,
          step: 1,
          scale: "log",
        },
        {
          identifier: "batch_size",
          type: "int",
          default: 180,
          minimum: 50,
          maximum: 800,
          step: 1,
          scale: "linear",
        },
        {
          identifier: "selling_price",
          type: "float",
          default: 34,
          minimum: 10,
          maximum: 100,
          scale: "linear",
        },
        {
          identifier: "expedite_fraction",
          type: "float",
          default: 0.25,
          minimum: 0,
          maximum: 1,
          scale: "linear",
        },
        {
          identifier: "marketing_spend",
          type: "float",
          default: 20,
          minimum: 20,
          maximum: 100,
          scale: "linear",
        },
      ],
    });
    expect(
      protocol.evaluate({
        parameterValues: {
          production_rate: 125,
          reorder_threshold: 300,
          batch_size: 250,
          selling_price: 50,
          expedite_fraction: 0.4,
          marketing_spend: 40,
        },
      }),
    ).toEqual({ objective: 42 });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        parameterValues: {
          production_rate: "125",
          reorder_threshold: "300",
          batch_size: "250",
          selling_price: "50",
          expedite_fraction: "0.4",
          marketing_spend: "40",
          demand_multiplier: "1",
        },
        metrics: ["metric_profit"],
        seed: 1234,
        dt: 0.1,
        maxTime: 36.5,
      }),
    );
  });

  it("loads a versioned manifest from a file", async () => {
    const manifest = await createManifest();
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-optimization-"));
    const path = join(directory, "optimize.json");
    try {
      await writeFile(path, JSON.stringify(manifest));
      await expect(loadOptimizationManifest(path)).resolves.toEqual(manifest);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("describes only optimized values and injects fixed values for evaluation", async () => {
    const manifest = await createManifest();
    const run = vi.fn(() => ({
      seed: 42,
      status: "complete" as const,
      completionReason: "maxTime" as const,
      frameCount: 1,
      finalTime: 10,
      finalPlaceTokenCounts: {},
      metrics: { "Infected Fraction": 0.25 },
    }));
    const model: PetrinautCompiledModel = {
      metadata: { parameters: [], places: [], metrics: [] },
      run,
    };
    const protocol = createOptimizationProtocol({ manifest, model });

    expect(protocol.describe()).toEqual({
      direction: "minimize",
      study: { trials: 20, sampler: "tpe", seed: 42 },
      parameters: [
        {
          identifier: "infected_ratio",
          type: "float",
          default: 0.01,
          minimum: 0.01,
          maximum: 0.5,
          scale: "log",
        },
      ],
    });
    expect(
      protocol.evaluate({ parameterValues: { infected_ratio: 0.1 } }),
    ).toEqual({ objective: 0.25 });
    expect(run).toHaveBeenCalledWith({
      initialMarking: {
        place__susceptible: 180,
        place__infected: 20,
        place__recovered: 0,
      },
      parameterValues: { infection_rate: "1.5", recovery_rate: "0.8" },
      metrics: ["metric__infected_fraction"],
      seed: 42,
      dt: 0.1,
      maxTime: 10,
    });
  });

  it("materializes integer and boolean suggestions plus a fixed boolean", async () => {
    const baseManifest = await createManifest();
    const baseScenario = baseManifest.model.definition.scenarios?.[0];
    if (!baseScenario) {
      throw new Error("The optimization fixture requires a scenario");
    }

    const manifest = parseOptimizationManifest({
      ...baseManifest,
      model: {
        ...baseManifest.model,
        definition: {
          ...baseManifest.model.definition,
          scenarios: [
            {
              ...baseScenario,
              scenarioParameters: [
                ...baseScenario.scenarioParameters,
                { identifier: "count", type: "integer", default: 4 },
                { identifier: "enabled", type: "boolean", default: 0 },
                {
                  identifier: "fixed_enabled",
                  type: "boolean",
                  default: 0,
                },
              ],
              initialState: {
                type: "per_place",
                content: {
                  place__susceptible: "scenario.enabled ? scenario.count : 0",
                  place__infected: "scenario.fixed_enabled ? 1 : 0",
                  place__recovered: "0",
                },
              },
            },
          ],
        },
      },
      scenario: {
        id: baseManifest.scenario.id,
        parameterBindings: {
          population: { kind: "fixed", value: 200 },
          infected_ratio: { kind: "fixed", value: 0.1 },
          count: {
            kind: "optimize",
            domain: {
              kind: "integer",
              minimum: 2,
              maximum: 10,
              step: 2,
              scale: "linear",
            },
          },
          enabled: { kind: "optimize", domain: { kind: "boolean" } },
          fixed_enabled: { kind: "fixed", value: true },
        },
      },
    });
    const run = vi.fn(() => ({
      seed: 42,
      status: "complete" as const,
      completionReason: "maxTime" as const,
      frameCount: 1,
      finalTime: 10,
      finalPlaceTokenCounts: {},
      metrics: { "Infected Fraction": 0.25 },
    }));
    const model: PetrinautCompiledModel = {
      metadata: { parameters: [], places: [], metrics: [] },
      run,
    };
    const protocol = createOptimizationProtocol({ manifest, model });

    expect(protocol.describe().parameters).toEqual([
      {
        identifier: "count",
        type: "int",
        default: 4,
        minimum: 2,
        maximum: 10,
        step: 2,
        scale: "linear",
      },
      { identifier: "enabled", type: "boolean", default: false },
    ]);
    expect(() =>
      protocol.evaluate({ parameterValues: { count: 5, enabled: false } }),
    ).toThrow('Optimization parameter "count" must align with step 2 from 2');
    expect(() =>
      protocol.evaluate({ parameterValues: { count: 6, enabled: 1 } }),
    ).toThrow('Optimization parameter "enabled" must be boolean');

    expect(
      protocol.evaluate({ parameterValues: { count: 6, enabled: false } }),
    ).toEqual({ objective: 0.25 });
    expect(run).toHaveBeenCalledWith({
      initialMarking: {
        place__susceptible: 0,
        place__infected: 1,
        place__recovered: 0,
      },
      parameterValues: { infection_rate: "1.5", recovery_rate: "0.8" },
      metrics: ["metric__infected_fraction"],
      seed: 42,
      dt: 0.1,
      maxTime: 10,
    });
  });

  it("requires every and only optimized value and validates its domain", async () => {
    const manifest = await createManifest();
    const model: PetrinautCompiledModel = {
      metadata: { parameters: [], places: [], metrics: [] },
      run: vi.fn(() => {
        throw new Error("should not run");
      }),
    };
    const protocol = createOptimizationProtocol({ manifest, model });

    expect(() => protocol.evaluate({ parameterValues: {} })).toThrow(
      'Missing optimized parameter "infected_ratio"',
    );
    expect(() =>
      protocol.evaluate({
        parameterValues: { infected_ratio: 0.1, population: 200 },
      }),
    ).toThrow('Unexpected optimization parameter "population"');
    expect(() =>
      protocol.evaluate({ parameterValues: { infected_ratio: 0.75 } }),
    ).toThrow(
      'Optimization parameter "infected_ratio" must be between 0.01 and 0.5',
    );
  });
});
