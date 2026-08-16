import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const modelPath = fileURLToPath(
  new URL("../../examples/sir-model.json", import.meta.url),
);

/**
 * The SIR manifest the optimization suites bootstrap the CLI with: one fixed
 * parameter, one optimized parameter, one metric. `execution` overrides the
 * defaults, so a caller can ask for several seeds per trial.
 */
export async function createOptimizationManifest(execution?: {
  seedsPerTrial?: number;
}) {
  const legacyModel = JSON.parse(await readFile(modelPath, "utf8")) as {
    title: string;
    scenarios: { id: string }[];
    metrics: { id: string }[];
    [key: string]: unknown;
  };
  const { title, ...definition } = legacyModel;
  return {
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
    execution: { seed: 42, dt: 1, maxTime: Number.MIN_VALUE, ...execution },
    study: { trials: 20, sampler: "tpe" },
  };
}
