import { createWorkerThreadRuntime } from "../environment";
import { createOptimizerStudyRunner } from "./study-runner";

import type { PetrinautOptimizationTrialOutcome } from "../optimization";
import type {
  OptimizerCancelMessage,
  OptimizerEvaluatedMessage,
  OptimizerInitMessage,
  OptimizerStartMessage,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
} from "./messages";
import type { LoadPyodide } from "./pyodide-like";
import type { OptimizerStudyRunner } from "./study-runner";

type ActiveRun = {
  cancelled: boolean;
  pendingRequestIds: Set<number>;
};

const workerRuntime = createWorkerThreadRuntime<
  OptimizerToWorkerMessage,
  OptimizerToMainMessage
>();

let runner: OptimizerStudyRunner | null = null;
const runs = new Map<string, ActiveRun>();
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

const handleStart = (message: OptimizerStartMessage): void => {
  const { runId } = message;
  if (!runner) {
    workerRuntime.postMessage({
      type: "error",
      runId,
      message: "The optimizer worker received a study before its runtime",
    });
    return;
  }
  const run: ActiveRun = { cancelled: false, pendingRequestIds: new Set() };
  runs.set(runId, run);
  runner
    .run({
      description: message.description,
      evaluate: (trial, suggestedValues) =>
        new Promise((resolve) => {
          const requestId = nextRequestId;
          nextRequestId += 1;
          pendingEvaluations.set(requestId, resolve);
          run.pendingRequestIds.add(requestId);
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
      isCancelled: () => run.cancelled,
    })
    .then(
      (summary) =>
        workerRuntime.postMessage(
          summary.cancelled === true
            ? { type: "cancelled", runId }
            : { type: "complete", runId, summary },
        ),
      (error: unknown) =>
        workerRuntime.postMessage({
          type: "error",
          runId,
          message: errorMessage(error),
        }),
    )
    .finally(() => {
      runs.delete(runId);
    });
};

const handleEvaluated = (message: OptimizerEvaluatedMessage): void => {
  const resolve = pendingEvaluations.get(message.requestId);
  if (!resolve) {
    return;
  }
  pendingEvaluations.delete(message.requestId);
  for (const run of runs.values()) {
    run.pendingRequestIds.delete(message.requestId);
  }
  resolve(message.outcome);
};

const handleCancel = (message: OptimizerCancelMessage): void => {
  const run = runs.get(message.runId);
  if (!run) {
    return;
  }
  run.cancelled = true;
  for (const requestId of run.pendingRequestIds) {
    const resolve = pendingEvaluations.get(requestId);
    pendingEvaluations.delete(requestId);
    resolve?.({ kind: "pruned", reason: "cancelled" });
  }
  run.pendingRequestIds.clear();
};

workerRuntime.onMessage((message) => {
  switch (message.type) {
    case "init":
      handleInit(message);
      break;
    case "start":
      handleStart(message);
      break;
    case "evaluated":
      handleEvaluated(message);
      break;
    case "cancel":
      handleCancel(message);
      break;
  }
});
