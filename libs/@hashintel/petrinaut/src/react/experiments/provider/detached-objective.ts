import {
  compileScenario,
  DEFAULT_PETRINAUT_EXTENSIONS,
  getOwn,
  runExperimentToCompletion,
  type MonteCarloExperiment,
  type MonteCarloUserDefinedMetricFrame,
  type MonteCarloWorkerProgress,
  type Scenario,
} from "@hashintel/petrinaut-core";
import {
  createWorkerPoolExperimentBackend,
  selectExperimentBackend,
  WORKER_POOL_BACKEND_ID,
} from "@hashintel/petrinaut-core/experiments";

import { createThrottle } from "../shared/throttle";
import { experimentBackendRegistrations } from "./create-experiment";
import { createWritableStore } from "./detached-objective/writable-store";
import { instantiateOnBackend } from "./shared/instantiate-on-backend";

import type { LanguageClientContextValue } from "../../lsp/context";
import type {
  DetachedObjectiveRequest,
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  DetachedObjectiveRunRequest,
  ExperimentComputeBackend,
} from "../context";
import type { SweepCellSnapshot } from "../sweep-session";
import type { WritableStore } from "./detached-objective/writable-store";
import type {
  ExperimentBackend,
  ExperimentRequest,
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

/** The backend a study's runs settled on for one requested backend. */
type ChosenBackend = {
  backend: ExperimentBackend;
  backendId: ExperimentComputeBackend;
  fallbackReason: string | null;
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
  /**
   * Streams one batch on the requested backend. The first run of a study on
   * a backend walks the registrations and keeps the winner for the study's
   * later runs. Runs queue per `cacheKey`; studies run side by side. A batch
   * that cannot run settles with the reason: the compile diagnostics, each
   * backend's refusal, the terminal error, or the count of errored runs.
   */
  run: (request: DetachedObjectiveRunRequest) => DetachedObjectiveRun;
  /** Cancels every run in flight and releases the backends runs chose. */
  dispose: () => void;
};

/** How often a run republishes its frames and progress while streaming. */
const RUN_PUBLISH_WINDOW_MS = 100;

const cancelledOutcome: DetachedObjectiveRunOutcome = {
  ok: false,
  cancelled: true,
  reason: "cancelled",
};

const failedOutcome = (reason: string): DetachedObjectiveRunOutcome => ({
  ok: false,
  cancelled: false,
  reason,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The frozen definition, its scenario HIR and its HIR artifacts never change
 * for a given `cacheKey`, so they compile once per study and per artifact
 * shape (with or without the HIR trees the GPU backend reads). A failed
 * compile is retried on the next batch rather than cached.
 */
const compileStudy = async (
  languageClient: LanguageClient,
  request: DetachedObjectiveRequest,
  includeHir: boolean,
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
    { includeHir },
  );
  const metricArtifact = getOwn(artifacts.metrics, request.metric.id);
  if (!metricArtifact) {
    throw new Error(
      failures
        .flatMap((failure) =>
          failure.diagnostics.map(
            (diagnostic) => `${failure.itemId}: ${diagnostic.message}`,
          ),
        )
        .join("; ") || "The objective metric did not compile",
    );
  }
  const scenarioHir = await languageClient.requestScenarioHir(scenario);
  return { scenario, scenarioHir, artifacts, metricArtifact };
};

/**
 * Scenario compilation is numeric; boolean bindings arrive as their 0/1
 * encoding, matching how the engine stores them.
 */
const numericScenarioValues = (
  values: DetachedObjectiveRequest["scenarioParameterValues"],
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(values).map(([identifier, value]) => [
      identifier,
      typeof value === "boolean" ? (value ? 1 : 0) : value,
    ]),
  );

export const createDetachedObjectiveSampler = ({
  languageClient,
  createWorker,
  shardCount,
  backendRegistrations = experimentBackendRegistrations,
}: {
  /** Read per call, so a replaced language client is picked up. */
  languageClient: { readonly current: LanguageClient };
  createWorker: ReusableWorkerFactory;
  /** The full pool's width; runs take a third of it. */
  shardCount: number;
  backendRegistrations?: typeof experimentBackendRegistrations;
}): DetachedObjectiveSampler => {
  const compileCache = new Map<string, Promise<CompiledStudy>>();
  const chosenBackends = new Map<string, ChosenBackend>();
  const runQueues = new Map<string, Promise<void>>();
  const runsInFlight = new Set<AbortController>();
  let sampleBackend: ExperimentBackend | null = null;
  let sampleChain: Promise<unknown> = Promise.resolve();
  // The wide CPU lane of a sweep: a third of the pool, so a study's runs
  // leave room for the surface walk and the user's own experiments.
  const runShards = Math.max(1, Math.floor(shardCount / 3));

  const compiledFor = (
    request: DetachedObjectiveRequest,
    includeHir: boolean,
  ): Promise<CompiledStudy> => {
    const key = `${request.cacheKey}|${includeHir ? "hir" : "flat"}`;
    let compiled = compileCache.get(key);
    if (!compiled) {
      compiled = compileStudy(languageClient.current, request, includeHir);
      compileCache.set(key, compiled);
      compiled.catch(() => {
        compileCache.delete(key);
      });
    }
    return compiled;
  };

  /**
   * The request for one batch: the compiled snapshot with its scenario
   * compiled at the batch's parameter point. Throws when the scenario does
   * not compile there.
   */
  const buildRequest = async (
    request: DetachedObjectiveRequest,
    options: { includeHir: boolean; runSeeds?: readonly number[] },
  ): Promise<ExperimentRequest> => {
    const { scenario, scenarioHir, artifacts, metricArtifact } =
      await compiledFor(request, options.includeHir);
    const compiledScenario = compileScenario(
      scenario,
      scenarioHir,
      request.definition.parameters,
      request.definition.places,
      request.definition.types,
      {
        scenarioParameterValues: numericScenarioValues(
          request.scenarioParameterValues,
        ),
      },
    );
    if (!compiledScenario.ok) {
      throw new Error(
        compiledScenario.errors.map((error) => error.message).join("; ") ||
          `Scenario "${scenario.name}" did not compile at this point`,
      );
    }
    return {
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
      ...(options.runSeeds === undefined
        ? {}
        : { runs: options.runSeeds.map((seed) => ({ seed })) }),
    };
  };

  const sampleBatch = async (
    request: DetachedObjectiveRequest,
  ): Promise<SweepCellSnapshot | null> => {
    try {
      const experimentRequest = await buildRequest(request, {
        includeHir: false,
      });
      sampleBackend ??= createWorkerPoolExperimentBackend({
        createWorker,
        shardCount: 1,
      });
      const handle = await instantiateOnBackend(
        sampleBackend,
        experimentRequest,
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

  /**
   * The handle for one run. The first run of a study on a requested backend
   * walks the registrations and keeps the winner; later runs instantiate on
   * it directly. Throws when the kept backend or every candidate refuses,
   * naming each and why.
   */
  const acquireHandle = async (
    request: DetachedObjectiveRunRequest,
    signal: AbortSignal,
  ): Promise<{
    handle: MonteCarloExperiment;
    chosen: ChosenBackend;
  }> => {
    const key = `${request.cacheKey}|${request.computeBackend}`;
    const chosen = chosenBackends.get(key);
    if (chosen) {
      const experimentRequest = await buildRequest(request, {
        includeHir: chosen.backend.needsHirTrees,
        runSeeds:
          chosen.backendId === WORKER_POOL_BACKEND_ID
            ? request.runSeeds
            : undefined,
      });
      try {
        const handle = await instantiateOnBackend(
          chosen.backend,
          experimentRequest,
          { signal },
        );
        return { handle, chosen };
      } catch (error) {
        // A refusal reads as the walk's declines do: the backend, then why.
        throw new Error(`${chosen.backendId}: ${errorMessage(error)}`);
      }
    }

    // The walk reports a request it cannot build as the first candidate's
    // refusal; building it here first keeps a compile failure's diagnostics
    // as the reason. The compile is cached for the candidate that needs it.
    await buildRequest(request, {
      includeHir: request.computeBackend === "webgpu",
    });
    // The GPU backend refuses pinned seeds, and a refusal on the walk would
    // read as a fallback. The seeds ride along only when every candidate is
    // the CPU pool.
    const pinSeedsOnWalk = request.computeBackend === "cpu";
    const selection = await selectExperimentBackend({
      registrations: backendRegistrations({
        computeBackend: request.computeBackend,
        createWorker,
        shardCount: runShards,
      }),
      buildRequest: ({ needsHirTrees }) =>
        buildRequest(request, {
          includeHir: needsHirTrees,
          runSeeds: pinSeedsOnWalk ? request.runSeeds : undefined,
        }),
      instantiateOptions: { signal },
    });
    if (!selection.ok) {
      throw new Error(
        selection.declined
          .map((entry) => `${entry.backendId}: ${entry.reason}`)
          .join("; ") || "Every backend declined the batch",
      );
    }
    const won: ChosenBackend = {
      backend: selection.backend,
      backendId: selection.backendId as ExperimentComputeBackend,
      fallbackReason: selection.declined[0]?.reason ?? null,
    };
    chosenBackends.set(key, won);
    if (
      pinSeedsOnWalk ||
      won.backendId !== WORKER_POOL_BACKEND_ID ||
      request.runSeeds === undefined
    ) {
      return { handle: selection.handle, chosen: won };
    }
    // The walk fell back to the CPU pool without the seeds. The pool takes
    // them, so its handle is replaced by one that pins them.
    selection.handle.dispose();
    const handle = await instantiateOnBackend(
      won.backend,
      await buildRequest(request, {
        includeHir: false,
        runSeeds: request.runSeeds,
      }),
      { signal },
    );
    return { handle, chosen: won };
  };

  const streamRun = async (
    request: DetachedObjectiveRunRequest,
    signal: AbortSignal,
    frames: WritableStore<readonly MonteCarloUserDefinedMetricFrame[]>,
    progress: WritableStore<MonteCarloWorkerProgress | null>,
  ): Promise<DetachedObjectiveRunOutcome> => {
    let handle: MonteCarloExperiment | null = null;
    const cancelHandle = () => handle?.cancel();
    signal.addEventListener("abort", cancelHandle, { once: true });
    // Read through a call so the abort flag is re-checked after the await (a
    // plain property read would be control-flow-narrowed to `false`).
    const isCancelled = () => signal.aborted;
    try {
      if (isCancelled()) {
        return cancelledOutcome;
      }
      const acquired = await acquireHandle(request, signal);
      if (isCancelled()) {
        acquired.handle.dispose();
        return cancelledOutcome;
      }
      handle = acquired.handle;
      const live = acquired.handle;
      const publish = createThrottle(() => {
        frames.set(live.metrics.get().frames);
        progress.set(live.progress.get());
      }, RUN_PUBLISH_WINDOW_MS);
      const offMetrics = live.metrics.subscribe(publish.call);
      const offProgress = live.progress.subscribe(publish.call);
      let completion: Awaited<ReturnType<typeof runExperimentToCompletion>>;
      try {
        completion = await runExperimentToCompletion(live);
      } finally {
        offMetrics();
        offProgress();
        publish.cancel();
      }
      const { event, frames: finalFrames, runResults } = completion;
      frames.set(finalFrames);
      if (event.type === "error") {
        return failedOutcome(event.message);
      }
      if (event.progress !== null) {
        progress.set(event.progress);
      }
      if (event.type === "cancelled") {
        return cancelledOutcome;
      }
      const { erroredRuns, runCount } = event.progress;
      if (erroredRuns > 0) {
        return failedOutcome(`${erroredRuns} of ${runCount} runs failed`);
      }
      return {
        ok: true,
        runsCompleted: event.progress.completedRuns,
        metricFrames: finalFrames,
        runResults,
        computeBackend: acquired.chosen.backendId,
        computeBackendFallbackReason: acquired.chosen.fallbackReason,
      };
    } catch (error) {
      return isCancelled()
        ? cancelledOutcome
        : failedOutcome(errorMessage(error));
    } finally {
      signal.removeEventListener("abort", cancelHandle);
    }
  };

  const run: DetachedObjectiveSampler["run"] = (request) => {
    const frames = createWritableStore<
      readonly MonteCarloUserDefinedMetricFrame[]
    >([]);
    const progress = createWritableStore<MonteCarloWorkerProgress | null>(null);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (request.signal?.aborted) {
      controller.abort();
    } else {
      request.signal?.addEventListener("abort", forwardAbort, { once: true });
    }
    runsInFlight.add(controller);

    const previous = runQueues.get(request.cacheKey) ?? Promise.resolve();
    const completion = previous.then(() =>
      streamRun(request, controller.signal, frames, progress),
    );
    const settled = completion.then(
      () => undefined,
      () => undefined,
    );
    runQueues.set(request.cacheKey, settled);
    void settled.then(() => {
      runsInFlight.delete(controller);
      request.signal?.removeEventListener("abort", forwardAbort);
      if (runQueues.get(request.cacheKey) === settled) {
        runQueues.delete(request.cacheKey);
      }
    });

    return {
      frames,
      progress,
      completion,
      cancel: () => controller.abort(),
    };
  };

  return {
    sample: (request) => {
      const next = sampleChain.then(() => sampleBatch(request));
      sampleChain = next.catch(() => null);
      return next;
    },
    run,
    dispose: () => {
      for (const controller of runsInFlight) {
        controller.abort();
      }
      runsInFlight.clear();
      for (const chosen of chosenBackends.values()) {
        chosen.backend.dispose?.();
      }
      chosenBackends.clear();
      sampleBackend?.dispose?.();
      sampleBackend = null;
    },
  };
};
