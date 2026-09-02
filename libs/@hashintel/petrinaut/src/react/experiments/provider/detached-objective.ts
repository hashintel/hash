import {
  compileScenario,
  DEFAULT_PETRINAUT_EXTENSIONS,
  getOwn,
  runExperimentToCompletion,
  type Scenario,
} from "@hashintel/petrinaut-core";
import { createWorkerPoolExperimentBackend } from "@hashintel/petrinaut-core/experiments";

import { instantiateOnBackend } from "./shared/instantiate-on-backend";

import type { LanguageClientContextValue } from "../../lsp/context";
import type { DetachedObjectiveRequest } from "../context";
import type { SweepCellSnapshot } from "../sweep-session";
import type {
  ExperimentBackend,
  ReusableWorkerFactory,
} from "@hashintel/petrinaut-core/experiments";

type LanguageClient = Pick<
  LanguageClientContextValue,
  "requestHirArtifacts" | "requestScenarioHir"
>;

type CompiledStudy = {
  scenario: Scenario;
  scenarioHir: Awaited<ReturnType<LanguageClient["requestScenarioHir"]>>;
  artifacts: Awaited<
    ReturnType<LanguageClient["requestHirArtifacts"]>
  >["artifacts"];
  metricArtifact: NonNullable<CompiledStudy["artifacts"]["metrics"][string]>;
};

export type DetachedObjectiveSampler = {
  /**
   * Computes one objective sample against a study's frozen model snapshot.
   * Batches are serialized on one background worker; compilation is cached
   * per `cacheKey`. Resolves null when the batch is refused or fails — a
   * hole in the surface, not an error.
   */
  sample: (
    request: DetachedObjectiveRequest,
  ) => Promise<SweepCellSnapshot | null>;
};

/**
 * The frozen definition, its scenario HIR and its HIR artifacts never change
 * for a given `cacheKey`, so they compile once per study. A failed compile
 * is retried on the next sample rather than cached.
 */
const compileStudy = async (
  languageClient: LanguageClient,
  request: DetachedObjectiveRequest,
): Promise<CompiledStudy> => {
  const scenario = (request.definition.scenarios ?? []).find(
    (candidate: Scenario) => candidate.id === request.scenarioId,
  );
  if (!scenario) {
    throw new Error(
      `Scenario ${request.scenarioId} is not in the model snapshot`,
    );
  }
  // The snapshot runs under default extensions, as it does on the optimizer
  // service — the live editor's toggles do not apply to a frozen study.
  const { artifacts, failures } = await languageClient.requestHirArtifacts(
    request.definition,
    DEFAULT_PETRINAUT_EXTENSIONS,
    { includeHir: false },
  );
  const metricArtifact = getOwn(artifacts.metrics, request.metric.id);
  if (!metricArtifact) {
    throw new Error(
      failures
        .map((failure) => failure.diagnostics[0]?.message)
        .filter(Boolean)
        .join("; ") || "The objective metric did not compile",
    );
  }
  const scenarioHir = await languageClient.requestScenarioHir(scenario);
  return { scenario, scenarioHir, artifacts, metricArtifact };
};

export const createDetachedObjectiveSampler = ({
  languageClient,
  createWorker,
}: {
  /** Read per call, so a replaced language client is picked up. */
  languageClient: { readonly current: LanguageClient };
  createWorker: ReusableWorkerFactory;
}): DetachedObjectiveSampler => {
  const compileCache = new Map<string, Promise<CompiledStudy>>();
  let backend: ExperimentBackend | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const compiledFor = (
    request: DetachedObjectiveRequest,
  ): Promise<CompiledStudy> => {
    let compiled = compileCache.get(request.cacheKey);
    if (!compiled) {
      compiled = compileStudy(languageClient.current, request);
      compileCache.set(request.cacheKey, compiled);
      compiled.catch(() => {
        compileCache.delete(request.cacheKey);
      });
    }
    return compiled;
  };

  const runBatch = async (
    request: DetachedObjectiveRequest,
  ): Promise<SweepCellSnapshot | null> => {
    try {
      const { scenario, scenarioHir, artifacts, metricArtifact } =
        await compiledFor(request);
      const compiledScenario = compileScenario(
        scenario,
        scenarioHir,
        request.definition.parameters,
        request.definition.places,
        request.definition.types,
        {
          // Scenario compilation is numeric; boolean bindings arrive as
          // their 0/1 encoding, matching how the engine stores them.
          scenarioParameterValues: Object.fromEntries(
            Object.entries(request.scenarioParameterValues).map(
              ([identifier, value]) => [
                identifier,
                typeof value === "boolean" ? (value ? 1 : 0) : value,
              ],
            ),
          ),
        },
      );
      if (!compiledScenario.ok) {
        return null;
      }

      backend ??= createWorkerPoolExperimentBackend({
        createWorker,
        shardCount: 1,
      });
      const handle = await instantiateOnBackend(
        backend,
        {
          sdcpn: request.definition,
          extensions: DEFAULT_PETRINAUT_EXTENSIONS,
          initialMarking: compiledScenario.result.initialState,
          parameterValues: compiledScenario.result.parameterValues,
          seed: request.seed,
          dt: request.dt,
          maxTime: request.maxTime,
          runCount: request.runCount,
          metricSpecs: [
            {
              kind: "expression",
              id: request.metric.id,
              label: request.metric.label,
              code: request.metric.code,
              sampleRuns: "all",
              runOutput: { type: "distribution" },
              artifact: metricArtifact,
            },
          ],
          hirArtifacts: artifacts,
        },
        {},
      );
      const { event, frames } = await runExperimentToCompletion(handle);
      if (event.type !== "complete") {
        return null;
      }
      return { runsCompleted: request.runCount, metricFrames: frames };
    } catch {
      return null;
    }
  };

  return {
    sample: (request) => {
      const next = chain.then(() => runBatch(request));
      chain = next.catch(() => null);
      return next;
    },
  };
};
