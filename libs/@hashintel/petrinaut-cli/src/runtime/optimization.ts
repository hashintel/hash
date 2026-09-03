import { readFile } from "node:fs/promises";

import {
  compileScenario,
  createMonteCarloExperiment,
  parseDocumentText,
  petrinautOptimizationEvaluateParamsSchema,
  petrinautOptimizationManifestSchema,
} from "@hashintel/petrinaut-core";
import { lowerScenarioToHir } from "@hashintel/petrinaut-core/hir";
import {
  deriveOptimizationTrialSeeds,
  describeOptimization,
  resolveTrialScenarioParameterValues,
} from "@hashintel/petrinaut-core/optimization";
import { createInProcessMonteCarloWorker } from "@hashintel/petrinaut-core/workers/monte-carlo";

import type {
  MonteCarloExperiment,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationEvaluateResult,
  PetrinautOptimizationManifest,
  WorkerFactory,
} from "@hashintel/petrinaut-core";
import type { PetrinautCompiledModel } from "@hashintel/petrinaut-core/compiled-model";

export { deriveOptimizationTrialSeeds as deriveTrialSeeds } from "@hashintel/petrinaut-core/optimization";

function formatManifestIssues(
  prefix: string,
  issues: readonly { path: PropertyKey[]; message: string }[],
): Error {
  const details = issues
    .map(
      ({ path, message }) =>
        `${path.length > 0 ? path.join(".") : "manifest"}: ${message}`,
    )
    .join("; ");
  return new Error(`${prefix}: ${details}`);
}

export function parseOptimizationManifest(
  data: unknown,
): PetrinautOptimizationManifest {
  const parsed = petrinautOptimizationManifestSchema.safeParse(data);
  if (!parsed.success) {
    throw formatManifestIssues(
      "Invalid optimization manifest",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

export async function loadOptimizationManifest(
  path: string,
): Promise<PetrinautOptimizationManifest> {
  const text = await readFile(path, "utf8");
  const document = parseDocumentText(text);
  if (!document.ok) {
    throw new Error(`Invalid optimization manifest: ${document.error}`);
  }
  return parseOptimizationManifest(document.data);
}

export type OptimizationProtocol = {
  describe(): PetrinautOptimizationDescribeResult;
  evaluate(params: unknown): Promise<PetrinautOptimizationEvaluateResult>;
};

/** Resolves when the experiment reports its terminal event. */
function waitForCompletion(experiment: MonteCarloExperiment): Promise<void> {
  return new Promise((resolve, reject) => {
    experiment.events.subscribe((event) => {
      if (event.type === "complete") {
        // A run that threw keeps reporting its last sampled frame, so its
        // metric value would pass the finite check as a stale objective.
        if (event.progress.erroredRuns > 0) {
          reject(
            new Error(
              `${event.progress.erroredRuns} of ${event.progress.runCount} optimization replicates failed`,
            ),
          );
        } else {
          resolve();
        }
      } else if (event.type === "error") {
        reject(new Error(event.message));
      } else if (event.type === "cancelled") {
        reject(new Error("Optimization trial was cancelled"));
      }
    });
  });
}

export function createOptimizationProtocol(args: {
  manifest: PetrinautOptimizationManifest;
  model: PetrinautCompiledModel;
  /**
   * Spawns one simulation worker per replicate shard.
   *
   * The CLI passes its `worker_threads` factory; without one, replicates run
   * through the in-process worker — same protocol, calling thread, no
   * parallelism.
   */
  createWorker?: WorkerFactory;
  /**
   * Upper bound on worker shards per trial; the experiment caps it at the
   * replicate count. Absent means one shard.
   */
  shardCount?: number;
  /** Test seam: observe or fake the experiment a trial runs as. */
  createExperiment?: typeof createMonteCarloExperiment;
}): OptimizationProtocol {
  const { manifest, model } = args;
  const createWorker = args.createWorker ?? createInProcessMonteCarloWorker;
  const createExperiment = args.createExperiment ?? createMonteCarloExperiment;
  const seedsPerTrial = manifest.execution.seedsPerTrial ?? 1;
  const trialSeeds = deriveOptimizationTrialSeeds(
    manifest.execution.seed,
    seedsPerTrial,
  );
  const scenario = manifest.model.definition.scenarios?.[0];
  const metric = manifest.model.definition.metrics?.[0];
  if (!scenario || !metric) {
    throw new Error(
      "An optimization manifest requires exactly one scenario and one metric",
    );
  }

  // Lower the scenario's expressions once per study; each trial re-runs only
  // the type-check and the interpreter with that trial's parameter values.
  const definition = manifest.model.definition;
  const scenarioHir = lowerScenarioToHir(scenario, {
    adHocContext: {
      netParameters: definition.parameters,
      places: definition.places,
      types: definition.types,
    },
  });

  return {
    describe() {
      return describeOptimization(manifest);
    },
    async evaluate(params) {
      const parsed =
        petrinautOptimizationEvaluateParamsSchema.safeParse(params);
      if (!parsed.success) {
        throw formatManifestIssues(
          "Invalid optimization.evaluate params",
          parsed.error.issues,
        );
      }
      const scenarioParameterValues = resolveTrialScenarioParameterValues(
        manifest,
        parsed.data.parameterValues,
      );

      const compiledScenario = compileScenario(
        scenario,
        scenarioHir,
        manifest.model.definition.parameters,
        manifest.model.definition.places,
        manifest.model.definition.types,
        { scenarioParameterValues },
      );
      if (!compiledScenario.ok) {
        throw new Error(
          `Scenario "${scenario.name}" could not be compiled: ${compiledScenario.errors
            .map(({ message }) => message)
            .join("; ")}`,
        );
      }

      // Replicates run as one Monte Carlo experiment: one run per seed, split
      // across simulation workers. Explicit run seeds keep the contract that
      // replicate 0 is the base seed verbatim, whatever the shard layout.
      const metricArtifact = Object.hasOwn(
        model.hirArtifacts.metrics,
        metric.id,
      )
        ? model.hirArtifacts.metrics[metric.id]
        : undefined;
      if (!metricArtifact) {
        throw new Error(
          `Objective metric "${metric.name}" has no compiled artifact`,
        );
      }

      const experiment = await createExperiment({
        sdcpn: model.sdcpn,
        hirArtifacts: model.hirArtifacts,
        initialMarking: compiledScenario.result.initialState,
        parameterValues: compiledScenario.result.parameterValues,
        seed: manifest.execution.seed,
        dt: manifest.execution.dt,
        maxTime: manifest.execution.maxTime,
        runCount: seedsPerTrial,
        runs: trialSeeds.map((seed) => ({ seed })),
        createWorker,
        ...(args.shardCount === undefined
          ? {}
          : { shardCount: args.shardCount }),
        metricSpecs: [
          {
            kind: "expression",
            id: metric.id,
            label: metric.name,
            // Completed runs keep reporting their frozen state, so each run's
            // latest sample is its final-frame value.
            sampleRuns: "all",
            code: metric.code,
            artifact: metricArtifact,
          },
        ],
      });

      let runResults: ReadonlyMap<number, Readonly<Record<string, number>>>;
      try {
        const completion = waitForCompletion(experiment);
        experiment.start();
        await completion;
        runResults = experiment.runResults.get();
      } finally {
        experiment.dispose();
      }

      const replicates = trialSeeds.map((seed, runIndex) => {
        const value = runResults.get(runIndex)?.[metric.id];
        if (value === undefined || !Number.isFinite(value)) {
          throw new Error(
            `Petrinaut result omitted a finite objective metric "${metric.name}" for seed ${seed}`,
          );
        }
        return { seed, objective: value };
      });
      // Online mean: summing the objectives first could overflow to Infinity
      // even when each one is finite.
      const objective = replicates.reduce(
        (mean, replicate, index) =>
          mean + (replicate.objective - mean) / (index + 1),
        0,
      );
      // A non-finite mean would serialize as null on the wire; fail loudly.
      if (!Number.isFinite(objective)) {
        throw new Error(
          `The mean of the objective metric "${metric.name}" is not finite`,
        );
      }
      return seedsPerTrial > 1 ? { objective, replicates } : { objective };
    },
  };
}
