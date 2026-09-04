import { createWorkerThreadRuntime } from "../environment";
import { createOptimizerStudyRunner } from "./study-runner";

import type { PetrinautOptimizationTrialOutcome } from "../optimization";
import type {
  OptimizerCancelMessage,
  OptimizerEvaluatedMessage,
  OptimizerExtendMessage,
  OptimizerInitMessage,
  OptimizerReleaseMessage,
  OptimizerStartMessage,
  OptimizerStudySummary,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
} from "./messages";
import type { LoadPyodide } from "./pyodide-like";
import type {
  OptimizerStudyCallbacks,
  OptimizerStudyRunner,
} from "./study-runner";

/** A run's segment, from the message that posted it until its outcome is reported. */
type ActiveSegment = {
  cancelled: boolean;
  pendingRequestIds: Set<number>;
};

const workerRuntime = createWorkerThreadRuntime<
  OptimizerToWorkerMessage,
  OptimizerToMainMessage
>();

let runner: OptimizerStudyRunner | null = null;
const segments = new Map<string, ActiveSegment>();
const pendingEvaluations = new Map<
  number,
  (outcome: PetrinautOptimizationTrialOutcome) => void
>();
let nextRequestId = 1;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ensureTrailingSlash = (url: string): string =>
  url.endsWith("/") ? url : `${url}/`;

const importLoadPyodide = async (indexURL: string): Promise<LoadPyodide> => {
  const module: unknown = await import(
    /* @vite-ignore */ `${indexURL}pyodide.mjs`
  );
  if (
    typeof module !== "object" ||
    module === null ||
    !("loadPyodide" in module) ||
    typeof module.loadPyodide !== "function"
  ) {
    throw new Error(`Pyodide at ${indexURL} exposes no loadPyodide`);
  }
  return module.loadPyodide as LoadPyodide;
};

const handleInit = (message: OptimizerInitMessage): void => {
  const indexURL = ensureTrailingSlash(message.pyodide.indexURL);
  runner = createOptimizerStudyRunner({
    loadPyodide: async (options) =>
      (await importLoadPyodide(indexURL))(options),
    config: { ...message.pyodide, indexURL },
    pythonSources: message.pythonSources,
  });
  runner.ready.then(
    () => workerRuntime.postMessage({ type: "ready" }),
    (error: unknown) =>
      workerRuntime.postMessage({
        type: "init-error",
        message: errorMessage(error),
      }),
  );
};

const runnerFor = (runId: string): OptimizerStudyRunner | null => {
  if (!runner) {
    workerRuntime.postMessage({
      type: "error",
      runId,
      message: "The optimizer worker received a study before its runtime",
    });
  }
  return runner;
};

const beginSegment = (runId: string): OptimizerStudyCallbacks => {
  const segment: ActiveSegment = {
    cancelled: false,
    pendingRequestIds: new Set(),
  };
  segments.set(runId, segment);
  return {
    onStarted: (requestedTrials) =>
      workerRuntime.postMessage({ type: "started", runId, requestedTrials }),
    evaluate: (trial, suggestedValues) =>
      new Promise((resolve) => {
        const requestId = nextRequestId;
        nextRequestId += 1;
        pendingEvaluations.set(requestId, resolve);
        segment.pendingRequestIds.add(requestId);
        workerRuntime.postMessage({
          type: "evaluate",
          runId,
          requestId,
          trial,
          suggestedValues,
        });
      }),
    onTrial: (event) =>
      workerRuntime.postMessage({ type: "trial", runId, event }),
    isCancelled: () => segment.cancelled,
  };
};

const reportSegment = (
  runId: string,
  summary: Promise<OptimizerStudySummary>,
): void => {
  summary
    .then(
      (result) =>
        workerRuntime.postMessage(
          result.cancelled === true
            ? { type: "cancelled", runId }
            : { type: "complete", runId, summary: result },
        ),
      (error: unknown) =>
        workerRuntime.postMessage({
          type: "error",
          runId,
          message: errorMessage(error),
        }),
    )
    .finally(() => {
      segments.delete(runId);
    });
};

const handleStart = (message: OptimizerStartMessage): void => {
  const { runId } = message;
  const current = runnerFor(runId);
  if (!current) {
    return;
  }
  reportSegment(
    runId,
    current.start({
      runId,
      description: message.description,
      parallelism: message.parallelism,
      callbacks: beginSegment(runId),
    }),
  );
};

const handleExtend = (message: OptimizerExtendMessage): void => {
  const { runId } = message;
  const current = runnerFor(runId);
  if (!current) {
    return;
  }
  reportSegment(
    runId,
    current.extend({
      runId,
      trials: message.trials,
      parallelism: message.parallelism,
      callbacks: beginSegment(runId),
    }),
  );
};

const handleEvaluated = (message: OptimizerEvaluatedMessage): void => {
  const resolve = pendingEvaluations.get(message.requestId);
  if (!resolve) {
    return;
  }
  pendingEvaluations.delete(message.requestId);
  for (const segment of segments.values()) {
    segment.pendingRequestIds.delete(message.requestId);
  }
  resolve(message.outcome);
};

const cancelSegment = (runId: string): void => {
  const segment = segments.get(runId);
  if (!segment) {
    return;
  }
  segment.cancelled = true;
  for (const requestId of segment.pendingRequestIds) {
    const resolve = pendingEvaluations.get(requestId);
    pendingEvaluations.delete(requestId);
    resolve?.({ kind: "pruned", reason: "cancelled" });
  }
  segment.pendingRequestIds.clear();
};

const handleCancel = (message: OptimizerCancelMessage): void => {
  cancelSegment(message.runId);
};

const handleRelease = (message: OptimizerReleaseMessage): void => {
  const { runId } = message;
  cancelSegment(runId);
  runner?.release(runId).then(
    () => workerRuntime.postMessage({ type: "released", runId }),
    (error: unknown) =>
      workerRuntime.postMessage({
        type: "error",
        runId,
        message: errorMessage(error),
      }),
  );
};

workerRuntime.onMessage((message) => {
  switch (message.type) {
    case "init":
      handleInit(message);
      break;
    case "start":
      handleStart(message);
      break;
    case "extend":
      handleExtend(message);
      break;
    case "evaluated":
      handleEvaluated(message);
      break;
    case "cancel":
      handleCancel(message);
      break;
    case "release":
      handleRelease(message);
      break;
  }
});
