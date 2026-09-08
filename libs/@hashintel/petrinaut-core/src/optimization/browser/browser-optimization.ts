import { v4 as generateUuid } from "uuid";

import { createAbortController } from "../../environment";
import {
  deriveOptimizationTrialSeeds,
  describeOptimization,
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  PETRINAUT_OPTIMIZATION_MAX_PARALLELISM,
  PETRINAUT_OPTIMIZATION_MAX_TRIALS,
  PETRINAUT_OPTIMIZATION_UNKNOWN_RUN_ERROR_CODE,
  parseOptimizationManifest,
  resolveTrialScenarioParameterValues,
} from "../index";
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
import {
  createOptimizerWorker,
  type OptimizerWorkerErrorEvent,
  type OptimizerWorkerLike,
} from "./worker/create-optimizer-worker";

import type { AbortControllerLike, AbortSignalLike } from "../../environment";
import type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautOptimizationChannel,
  PetrinautOptimizationEvent,
  PetrinautOptimizationManifest,
} from "../index";
import type {
  OptimizerEvaluateMessage,
  OptimizerExtendMessage,
  OptimizerStartMessage,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
} from "./messages";

export type CreateBrowserOptimizationOptions = {
  pyodide?: Partial<OptimizerPyodideConfig>;
  createWorker?: () => OptimizerWorkerLike;
};

/**
 * `queued` waits for the worker to take the run's segment, `running` has it
 * posted, `finished-resumable` ended a segment with the study kept in the
 * worker, and `finished` has no study to return to.
 */
type RunStatus = "queued" | "running" | "finished-resumable" | "finished";

type RunRecord = {
  readonly runId: string;
  readonly manifest: PetrinautOptimizationManifest;
  readonly seeds: readonly number[];
  readonly log: OptimizationRunLog;
  status: RunStatus;
  /** The segment the worker runs when it takes this run. */
  command: OptimizerStartMessage | OptimizerExtendMessage;
  /** Aborted when the segment is cancelled; the next segment gets a fresh one. */
  controller: AbortControllerLike;
};

type WorkerSession = {
  readonly worker: OptimizerWorkerLike;
  /** Settles on `ready`; a session that fails before or after is torn down instead. */
  readonly ready: Promise<void>;
  readonly markReady: () => void;
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
      ? "The optimizer worker failed"
      : event.message,
  );

const unavailableEvent = (error: unknown): OptimizationRunLogEvent => ({
  type: "error",
  code: "optimizer_unavailable",
  message: `The in-browser optimizer could not start: ${errorMessage(error)}`,
  retryable: true,
});

const isSettled = (run: RunRecord): boolean =>
  run.status === "finished" || run.status === "finished-resumable";

/** Trials the study was told an outcome for, which is where the next segment counts from. */
const toldTrials = (log: OptimizationRunLog): number =>
  log.events.filter((event) => event.type === "trial").length;

const unknownRunError = (runId: string): Error =>
  Object.assign(new Error(`Unknown optimization run "${runId}"`), {
    code: PETRINAUT_OPTIMIZATION_UNKNOWN_RUN_ERROR_CODE,
  });

const disposedError = (): Error =>
  new Error("The in-browser optimizer was disposed");

const creationAbortedError = (): Error => {
  const error = new Error("optimization run creation aborted");
  error.name = "AbortError";
  return error;
};

const notResumableError = (run: RunRecord): Error =>
  new Error(
    run.status === "finished"
      ? `Optimization run "${run.runId}" has no study to extend: it was released or failed`
      : `Optimization run "${run.runId}" is still running`,
  );

const validParallelism = (value: number | undefined): number => {
  if (value === undefined) {
    return 1;
  }
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > PETRINAUT_OPTIMIZATION_MAX_PARALLELISM
  ) {
    throw new Error(
      `Optimization parallelism must be an integer between 1 and ${PETRINAUT_OPTIMIZATION_MAX_PARALLELISM}`,
    );
  }
  return value;
};

const requestedTotal = (told: number, trials: number): number => {
  if (!Number.isInteger(trials) || trials < 1) {
    throw new Error(
      "An optimization extends by a positive whole number of trials",
    );
  }
  const total = told + trials;
  if (total > PETRINAUT_OPTIMIZATION_MAX_TRIALS) {
    throw new Error(
      `An optimization may run at most ${PETRINAUT_OPTIMIZATION_MAX_TRIALS.toLocaleString()} trials in total; ${told.toLocaleString()} already ran`,
    );
  }
  return total;
};

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
}): PetrinautConnectedOptimizationCapability => {
  const { channel } = options;
  const runs = new Map<string, RunRecord>();
  const queue: RunRecord[] = [];
  /** The run waiting for the worker or running on it. */
  let active: RunRecord | null = null;
  let session: WorkerSession | null = null;
  let disposed = false;

  const activeRunFor = (runId: string): RunRecord | null => {
    const run = runs.get(runId);
    return run && run.status === "running" ? run : null;
  };

  const post = (message: OptimizerToWorkerMessage): void => {
    session?.worker.postMessage(message);
  };

  /** Ends the run's segment with `event` and lets the queue move on. */
  const finish = (
    run: RunRecord,
    event: OptimizationRunLogEvent,
    status: "finished-resumable" | "finished",
  ): void => {
    if (isSettled(run)) {
      return;
    }
    // eslint-disable-next-line no-param-reassign -- the record's status is the session state this helper advances
    run.status = status;
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

  /**
   * Drops a worker that failed to load or crashed. The run on it, if any,
   * fails as retryable, and the queue moves on to a fresh worker.
   */
  const failSession = (stale: WorkerSession, error: unknown): void => {
    if (session !== stale) {
      return;
    }
    session = null;
    stale.worker.terminate();
    if (active) {
      finish(active, unavailableEvent(error), "finished");
    }
  };

  /** Stops the segment on the worker (when one is posted) and drops the study. */
  const discardStudy = (run: RunRecord): void => {
    run.controller.abort();
    if (run.status === "running") {
      post({ type: "cancel", runId: run.runId });
    }
    post({ type: "release", runId: run.runId });
  };

  const failTrialEvaluation = (run: RunRecord, error: unknown): void => {
    discardStudy(run);
    finish(
      run,
      {
        type: "error",
        code: "trial_evaluation_failed",
        message: errorMessage(error),
        retryable: false,
      },
      "finished",
    );
  };

  const handleEvaluate = async (
    message: OptimizerEvaluateMessage,
  ): Promise<void> => {
    const run = activeRunFor(message.runId);
    if (!run) {
      return;
    }
    const { controller } = run;
    // The worker answers the evaluations of a cancelled segment itself.
    const segmentIsCurrent = (): boolean =>
      run.controller === controller &&
      run.status === "running" &&
      !controller.signal.aborted;
    if (!segmentIsCurrent()) {
      return;
    }
    try {
      const outcome = await channel.evaluateTrial({
        runId: run.runId,
        trial: message.trial,
        manifest: run.manifest,
        suggestedValues: message.suggestedValues,
        scenarioParameterValues: resolveTrialScenarioParameterValues(
          run.manifest,
          message.suggestedValues,
        ),
        seeds: run.seeds,
        signal: controller.signal,
      });
      if (segmentIsCurrent()) {
        post({ type: "evaluated", requestId: message.requestId, outcome });
      }
    } catch (error) {
      if (segmentIsCurrent()) {
        failTrialEvaluation(run, error);
      }
    }
  };

  const handleWorkerMessage = (
    current: WorkerSession,
    message: OptimizerToMainMessage,
  ): void => {
    switch (message.type) {
      case "ready":
        current.markReady();
        return;
      case "init-error":
        failSession(current, new Error(message.message));
        return;
      case "evaluate":
        void handleEvaluate(message);
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
          finish(
            run,
            {
              type: "complete",
              requestedTrials: summary.requestedTrials,
              completedTrials: summary.completedTrials,
              prunedTrials: summary.prunedTrials,
              failedTrials: summary.failedTrials,
              best: summary.best,
            },
            "finished-resumable",
          );
        }
        return;
      }
      case "cancelled": {
        const run = activeRunFor(message.runId);
        if (run) {
          finish(run, cancelledEvent, "finished-resumable");
        }
        return;
      }
      case "error": {
        const run = activeRunFor(message.runId);
        if (run) {
          finish(
            run,
            {
              type: "error",
              code: "study_failed",
              message: message.message,
              retryable: false,
            },
            "finished",
          );
        }
      }
    }
  };

  const ensureSession = (): WorkerSession => {
    if (session) {
      return session;
    }
    const worker = options.createWorker();
    const { promise: ready, resolve: markReady } =
      Promise.withResolvers<void>();
    const current: WorkerSession = { worker, ready, markReady };
    worker.addEventListener("message", ({ data }) => {
      handleWorkerMessage(current, data);
    });
    worker.addEventListener("error", (event) => {
      failSession(current, workerLoadError(event));
    });
    worker.postMessage({
      type: "init",
      pyodide: options.pyodide,
      pythonSources: optimizerPythonSources,
    });
    session = current;
    return current;
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
    let current: WorkerSession;
    try {
      current = ensureSession();
    } catch (error) {
      finish(run, unavailableEvent(error), "finished");
      return;
    }
    void current.ready.then(() => {
      if (active === run && run.status === "queued" && session === current) {
        run.status = "running";
        current.worker.postMessage(run.command);
      }
    });
  };

  const enqueue = (run: RunRecord, requestedTrials: number): void => {
    run.log.append({ type: "started", requestedTrials });
    queue.push(run);
    startNext();
  };

  return {
    async createOptimizationRun(input, runOptions = {}) {
      if (disposed) {
        throw disposedError();
      }
      if (runOptions.signal?.aborted) {
        throw creationAbortedError();
      }
      const parallelism = validParallelism(runOptions.parallelism);
      const manifest = parseOptimizationManifest(input);
      const runId = generateUuid();
      const run: RunRecord = {
        runId,
        manifest,
        seeds: deriveOptimizationTrialSeeds(
          manifest.execution.seed,
          manifest.execution.seedsPerTrial ?? 1,
        ),
        log: createOptimizationRunLog(),
        status: "queued",
        command: {
          type: "start",
          runId,
          description: describeOptimization(manifest),
          parallelism,
        },
        controller: createAbortController(),
      };
      runs.set(runId, run);
      enqueue(run, manifest.study.trials);
      return { runId };
    },
    async extendOptimizationRun(runId, trials) {
      if (disposed) {
        throw disposedError();
      }
      const run = runs.get(runId);
      if (!run) {
        throw unknownRunError(runId);
      }
      if (run.status !== "finished-resumable") {
        throw notResumableError(run);
      }
      const total = requestedTotal(toldTrials(run.log), trials);
      run.command = { type: "extend", runId, trials };
      run.controller = createAbortController();
      run.status = "queued";
      enqueue(run, total);
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
      if (!run || isSettled(run)) {
        return;
      }
      run.controller.abort();
      if (run.status === "running") {
        post({ type: "cancel", runId });
        return;
      }
      // The segment never reached the worker: an extension leaves its study
      // kept, a first run has no study at all.
      finish(
        run,
        cancelledEvent,
        run.command.type === "extend" ? "finished-resumable" : "finished",
      );
    },
    async releaseOptimizationRun(runId) {
      const run = runs.get(runId);
      if (!run || run.status === "finished") {
        return;
      }
      discardStudy(run);
      if (isSettled(run)) {
        run.status = "finished";
      } else {
        finish(run, cancelledEvent, "finished");
      }
    },
    dispose() {
      disposed = true;
      for (const run of runs.values()) {
        if (!isSettled(run)) {
          run.controller.abort();
          run.log.append(cancelledEvent);
        }
        run.status = "finished";
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
