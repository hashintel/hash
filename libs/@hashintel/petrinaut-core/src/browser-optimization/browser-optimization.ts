/**
 * @layerRoot core.optimization.browser
 * @role Runs the Optuna study in a Pyodide worker and evaluates trials through the host channel
 */
import { v4 as generateUuid } from "uuid";

import { createAbortController } from "../environment";
import {
  deriveOptimizationTrialSeeds,
  describeOptimization,
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  petrinautOptimizationManifestSchema,
  resolveTrialScenarioParameterValues,
} from "../optimization";
import {
  createOptimizerWorker,
  type OptimizerWorkerErrorEvent,
  type OptimizerWorkerLike,
} from "./create-optimizer-worker";
import {
  defaultOptimizerPyodideConfig,
  type OptimizerPyodideConfig,
} from "./pyodide-config";
import { optimizerPythonSources } from "./python-sources";
import {
  createOptimizationRunLog,
  type OptimizationRunLog,
  type OptimizationRunLogEvent,
} from "./run-log";

import type { AbortSignalLike } from "../environment";
import type {
  PetrinautConnectedOptimization,
  PetrinautOptimization,
  PetrinautOptimizationChannel,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationEvent,
  PetrinautOptimizationManifest,
  PetrinautOptimizationTrialOutcome,
  PetrinautOptimizationTrialRequest,
} from "../optimization";
import type {
  OptimizerEvaluateMessage,
  OptimizerToMainMessage,
} from "./messages";

export type CreateBrowserOptimizationOptions = {
  pyodide?: Partial<OptimizerPyodideConfig>;
  createWorker?: () => OptimizerWorkerLike;
};

type RunStatus = "queued" | "starting" | "running" | "finished";

type RunRecord = {
  readonly runId: string;
  readonly manifest: PetrinautOptimizationManifest;
  readonly description: PetrinautOptimizationDescribeResult;
  readonly seeds: readonly number[];
  readonly log: OptimizationRunLog;
  readonly signal: AbortSignalLike;
  readonly abort: () => void;
  status: RunStatus;
};

type WorkerSession = {
  readonly worker: OptimizerWorkerLike;
  readonly ready: Promise<void>;
};

const cancelledEvent: OptimizationRunLogEvent = {
  type: "error",
  code: PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  message: "optimization cancelled",
  retryable: false,
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const workerLoadError = (event: OptimizerWorkerErrorEvent): Error =>
  new Error(
    event.message === undefined || event.message === ""
      ? "The optimizer worker failed to load"
      : event.message,
  );

const unavailableEvent = (error: unknown): OptimizationRunLogEvent => ({
  type: "error",
  code: "optimizer_unavailable",
  message: `The in-browser optimizer could not start: ${errorMessage(error)}`,
  retryable: true,
});

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "AbortError";

const invalidManifestError = (
  issues: readonly { path: PropertyKey[]; message: string }[],
): Error =>
  new Error(
    `Invalid optimization manifest: ${issues
      .map(
        ({ path, message }) =>
          `${path.length > 0 ? path.join(".") : "manifest"}: ${message}`,
      )
      .join("; ")}`,
  );

/** The shape the optimizations provider drops a stale stored run on. */
const unknownRunError = (runId: string): Error =>
  Object.assign(new Error(`Unknown optimization run "${runId}"`), {
    category: "http",
    httpStatus: 404,
  });

async function* attachToLog(
  log: OptimizationRunLog,
  options: {
    cursor?: number;
    signal?: AbortSignalLike;
    onAttached?: () => void;
  },
): AsyncGenerator<PetrinautOptimizationEvent> {
  options.onAttached?.();
  yield* log.replay({ cursor: options.cursor, signal: options.signal });
}

const connectBrowserOptimization = (options: {
  channel: PetrinautOptimizationChannel;
  pyodide: OptimizerPyodideConfig;
  createWorker: () => OptimizerWorkerLike;
}): PetrinautOptimization & { dispose(this: void): void } => {
  const { channel } = options;
  const runs = new Map<string, RunRecord>();
  const queue: RunRecord[] = [];
  let active: RunRecord | null = null;
  let session: WorkerSession | null = null;
  let disposed = false;

  const activeRunFor = (runId: string): RunRecord | null => {
    const run = runs.get(runId);
    return run && run.status === "running" ? run : null;
  };

  const resetSession = (stale: WorkerSession): void => {
    if (session === stale) {
      session = null;
      stale.worker.terminate();
    }
  };

  const finish = (run: RunRecord, event: OptimizationRunLogEvent): void => {
    if (run.status === "finished") {
      return;
    }
    // eslint-disable-next-line no-param-reassign -- the record's status is the session state this helper advances
    run.status = "finished";
    run.log.append(event);
    const queuedAt = queue.indexOf(run);
    if (queuedAt !== -1) {
      queue.splice(queuedAt, 1);
    }
    if (active === run) {
      active = null;
      // eslint-disable-next-line no-use-before-define -- mutual recursion
      startNext();
    }
  };

  const reply = (
    requestId: number,
    outcome: PetrinautOptimizationTrialOutcome,
  ): void => {
    session?.worker.postMessage({ type: "evaluated", requestId, outcome });
  };

  const failTrialEvaluation = (run: RunRecord, error: unknown): void => {
    run.abort();
    session?.worker.postMessage({ type: "cancel", runId: run.runId });
    finish(run, {
      type: "error",
      code: "trial_evaluation_failed",
      message: errorMessage(error),
      retryable: false,
    });
  };

  const handleEvaluate = (message: OptimizerEvaluateMessage): void => {
    const run = activeRunFor(message.runId);
    if (!run) {
      return;
    }
    let request: PetrinautOptimizationTrialRequest;
    try {
      request = {
        runId: run.runId,
        trial: message.trial,
        manifest: run.manifest,
        suggestedValues: message.suggestedValues,
        scenarioParameterValues: resolveTrialScenarioParameterValues(
          run.manifest,
          message.suggestedValues,
        ),
        seeds: run.seeds,
        signal: run.signal,
      };
    } catch (error) {
      failTrialEvaluation(run, error);
      return;
    }
    const evaluated = (outcome: PetrinautOptimizationTrialOutcome): void => {
      if (run.status === "running") {
        reply(message.requestId, outcome);
      }
    };
    const evaluationFailed = (error: unknown): void => {
      if (run.status !== "running") {
        return;
      }
      if (isAbortError(error)) {
        reply(message.requestId, { kind: "pruned", reason: "cancelled" });
      } else {
        failTrialEvaluation(run, error);
      }
    };
    let evaluation: Promise<PetrinautOptimizationTrialOutcome>;
    try {
      evaluation = channel.evaluateTrial(request);
    } catch (error) {
      evaluationFailed(error);
      return;
    }
    evaluation.then(evaluated, evaluationFailed);
  };

  const handleWorkerMessage = (message: OptimizerToMainMessage): void => {
    switch (message.type) {
      case "ready":
      case "init-error":
        return;
      case "evaluate":
        handleEvaluate(message);
        return;
      case "trial": {
        const run = activeRunFor(message.runId);
        const { event } = message;
        run?.log.append({
          type: "trial",
          trial: event.trial,
          parameters: event.parameters,
          objective: event.state === "complete" ? event.objective : null,
          state: event.state,
          best: event.best,
        });
        return;
      }
      case "complete": {
        const run = activeRunFor(message.runId);
        const { summary } = message;
        if (run) {
          finish(run, {
            type: "complete",
            requestedTrials: summary.requestedTrials,
            completedTrials: summary.completedTrials,
            prunedTrials: summary.prunedTrials,
            failedTrials: summary.failedTrials,
            best: summary.best,
          });
        }
        return;
      }
      case "cancelled": {
        const run = activeRunFor(message.runId);
        if (run) {
          finish(run, cancelledEvent);
        }
        return;
      }
      case "error": {
        const run = activeRunFor(message.runId);
        if (run) {
          finish(run, {
            type: "error",
            code: "study_failed",
            message: message.message,
            retryable: false,
          });
        }
      }
    }
  };

  const ensureSession = (): WorkerSession => {
    if (session) {
      return session;
    }
    const worker = options.createWorker();
    const ready = new Promise<void>((resolve, reject) => {
      worker.addEventListener("message", ({ data }) => {
        if (data.type === "ready") {
          resolve();
        } else if (data.type === "init-error") {
          reject(new Error(data.message));
        } else {
          handleWorkerMessage(data);
        }
      });
      worker.addEventListener("error", (event) => {
        reject(workerLoadError(event));
      });
    });
    worker.postMessage({
      type: "init",
      pyodide: options.pyodide,
      pythonSources: optimizerPythonSources,
    });
    session = { worker, ready };
    return session;
  };

  const startNext = (): void => {
    if (disposed || active) {
      return;
    }
    const run = queue.shift();
    if (!run) {
      return;
    }
    active = run;
    run.status = "starting";
    let current: WorkerSession;
    try {
      current = ensureSession();
    } catch (error) {
      finish(run, unavailableEvent(error));
      return;
    }
    current.ready.then(
      () => {
        if (run.status === "starting" && session === current) {
          run.status = "running";
          current.worker.postMessage({
            type: "start",
            runId: run.runId,
            description: run.description,
          });
        }
      },
      (error: unknown) => {
        resetSession(current);
        finish(run, unavailableEvent(error));
      },
    );
  };

  return {
    async createOptimizationRun(input) {
      if (disposed) {
        throw new Error("The in-browser optimizer was disposed");
      }
      const parsed = petrinautOptimizationManifestSchema.safeParse(input);
      if (!parsed.success) {
        throw invalidManifestError(parsed.error.issues);
      }
      const manifest = parsed.data;
      const controller = createAbortController();
      const run: RunRecord = {
        runId: generateUuid(),
        manifest,
        description: describeOptimization(manifest),
        seeds: deriveOptimizationTrialSeeds(
          manifest.execution.seed,
          manifest.execution.seedsPerTrial ?? 1,
        ),
        log: createOptimizationRunLog(),
        signal: controller.signal,
        abort: () => controller.abort(),
        status: "queued",
      };
      runs.set(run.runId, run);
      run.log.append({
        type: "started",
        requestedTrials: manifest.study.trials,
      });
      queue.push(run);
      startNext();
      return { runId: run.runId };
    },
    attachOptimizationRun(runId, attachOptions = {}) {
      const run = runs.get(runId);
      if (!run) {
        throw unknownRunError(runId);
      }
      return attachToLog(run.log, attachOptions);
    },
    async cancelOptimizationRun(runId) {
      const run = runs.get(runId);
      if (!run || run.status === "finished") {
        return;
      }
      run.abort();
      if (run.status === "running") {
        session?.worker.postMessage({ type: "cancel", runId });
        return;
      }
      finish(run, cancelledEvent);
    },
    dispose() {
      disposed = true;
      for (const run of runs.values()) {
        if (run.status !== "finished") {
          run.abort();
          run.status = "finished";
          run.log.append(cancelledEvent);
        }
      }
      queue.length = 0;
      active = null;
      session?.worker.terminate();
      session = null;
    },
  };
};

export const createBrowserOptimization = (
  options: CreateBrowserOptimizationOptions = {},
): PetrinautConnectedOptimization => ({
  kind: "connected",
  connect: (channel) =>
    connectBrowserOptimization({
      channel,
      pyodide: { ...defaultOptimizerPyodideConfig(), ...options.pyodide },
      createWorker: options.createWorker ?? createOptimizerWorker,
    }),
});
