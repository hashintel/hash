/**
 * The optimizer worker protocol, detached from any thread host: a
 * {@link WorkerThreadRuntime} posts and receives the messages, and
 * `createRunner` supplies the study runner, so a test drives the protocol with
 * a fake of each.
 */
import type { WorkerThreadRuntime } from "../../../environment";
import type { PetrinautOptimizationTrialOutcome } from "../../index";
import type {
  OptimizerInitMessage,
  OptimizerStudySummary,
  OptimizerToMainMessage,
  OptimizerToWorkerMessage,
} from "../messages";
import type {
  OptimizerStudyCallbacks,
  OptimizerStudyRunner,
} from "./study-runner";

export type OptimizerRunnerFactory = (
  init: Pick<OptimizerInitMessage, "pyodide" | "pythonSources">,
) => OptimizerStudyRunner;

/** An evaluate request posted to the main thread and not yet answered. */
type PendingEvaluation = {
  readonly runId: string;
  readonly resolve: (outcome: PetrinautOptimizationTrialOutcome) => void;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs the optimizer worker protocol against `runtime`.
 *
 * Handles `init`, `start`, `extend`, `evaluated`, `cancel` and `release`;
 * posts `ready` or `init-error` once, then one `evaluate` per trial and one
 * `complete`, `cancelled` or `error` per segment.
 */
export const attachOptimizerWorker = (
  runtime: WorkerThreadRuntime<
    OptimizerToWorkerMessage,
    OptimizerToMainMessage
  >,
  createRunner: OptimizerRunnerFactory,
): void => {
  let runner: OptimizerStudyRunner | null = null;
  const pending = new Map<number, PendingEvaluation>();
  /** Runs whose current segment was cancelled; cleared when the segment ends. */
  const cancelled = new Set<string>();
  let nextRequestId = 1;

  const postError = (runId: string, error: unknown): void => {
    runtime.postMessage({ type: "error", runId, message: errorMessage(error) });
  };

  const initialize = (message: OptimizerInitMessage): void => {
    const current = createRunner({
      pyodide: message.pyodide,
      pythonSources: message.pythonSources,
    });
    runner = current;
    current.ready.then(
      () => runtime.postMessage({ type: "ready" }),
      (error: unknown) =>
        runtime.postMessage({
          type: "init-error",
          message: errorMessage(error),
        }),
    );
  };

  const runnerFor = (runId: string): OptimizerStudyRunner | null => {
    if (!runner) {
      postError(
        runId,
        new Error("The optimizer worker received a study before its runtime"),
      );
    }
    return runner;
  };

  const beginSegment = (runId: string): OptimizerStudyCallbacks => {
    cancelled.delete(runId);
    return {
      evaluate: (trial, suggestedValues) =>
        new Promise((resolve) => {
          const requestId = nextRequestId;
          nextRequestId += 1;
          pending.set(requestId, { runId, resolve });
          runtime.postMessage({
            type: "evaluate",
            runId,
            requestId,
            trial,
            suggestedValues,
          });
        }),
      onTrial: (event) => runtime.postMessage({ type: "trial", runId, event }),
      isCancelled: () => cancelled.has(runId),
    };
  };

  const reportSegment = (
    runId: string,
    summary: Promise<OptimizerStudySummary>,
  ): void => {
    summary
      .then(
        (result) =>
          runtime.postMessage(
            result.cancelled === true
              ? { type: "cancelled", runId }
              : { type: "complete", runId, summary: result },
          ),
        (error: unknown) => postError(runId, error),
      )
      .finally(() => cancelled.delete(runId));
  };

  /** Ends the run's segment early: its loop stops at the next poll, and its trials in flight are pruned. */
  const cancelSegment = (runId: string): void => {
    cancelled.add(runId);
    for (const [requestId, evaluation] of pending) {
      if (evaluation.runId === runId) {
        pending.delete(requestId);
        evaluation.resolve({ kind: "pruned", reason: "cancelled" });
      }
    }
  };

  runtime.onMessage((message) => {
    switch (message.type) {
      case "init":
        initialize(message);
        return;
      case "start": {
        const current = runnerFor(message.runId);
        if (current) {
          reportSegment(
            message.runId,
            current.start({
              runId: message.runId,
              description: message.description,
              parallelism: message.parallelism,
              callbacks: beginSegment(message.runId),
            }),
          );
        }
        return;
      }
      case "extend": {
        const current = runnerFor(message.runId);
        if (current) {
          reportSegment(
            message.runId,
            current.extend({
              runId: message.runId,
              trials: message.trials,
              callbacks: beginSegment(message.runId),
            }),
          );
        }
        return;
      }
      case "evaluated": {
        const evaluation = pending.get(message.requestId);
        if (evaluation) {
          pending.delete(message.requestId);
          evaluation.resolve(message.outcome);
        }
        return;
      }
      case "cancel":
        cancelSegment(message.runId);
        return;
      case "release": {
        if (!runner) {
          return;
        }
        cancelSegment(message.runId);
        // The release runs after the segments queued before it, so once it
        // settles no segment of the run remains to observe the cancellation.
        runner.release(message.runId).then(
          () => cancelled.delete(message.runId),
          (error: unknown) => postError(message.runId, error),
        );
      }
    }
  });
};
