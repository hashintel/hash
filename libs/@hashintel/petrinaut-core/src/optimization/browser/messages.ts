import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationTrialOutcome,
} from "../index";
import type { OptimizerPyodideConfig } from "./pyodide-config";

export type OptimizerBestTrial = {
  trial: number;
  parameters: Record<string, OptimizationScalar>;
  objective: number;
};

/** One finished Optuna trial, as the Python study reports it. */
export type OptimizerTrialPayload = {
  trial: number;
  parameters: Record<string, OptimizationScalar>;
  objective: number | null;
  state: "complete" | "pruned" | "failed";
  best: OptimizerBestTrial | null;
};

/** Counts over the whole study so far, across every segment it ran. */
export type OptimizerStudySummary = {
  requestedTrials: number;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  best: OptimizerBestTrial | null;
  /** Set when the segment stopped early because the run was cancelled. */
  cancelled?: boolean;
};

export type OptimizerInitMessage = {
  type: "init";
  pyodide: OptimizerPyodideConfig;
  pythonSources: Readonly<Record<string, string>>;
};

/** Creates the study and runs its first `description.study.trials` trials. */
export type OptimizerStartMessage = {
  type: "start";
  runId: string;
  description: PetrinautOptimizationDescribeResult;
  /** Trials kept in flight at once. */
  parallelism: number;
};

/** Runs `trials` more on the kept study, at its parallelism; trial numbers continue. */
export type OptimizerExtendMessage = {
  type: "extend";
  runId: string;
  trials: number;
};

export type OptimizerEvaluatedMessage = {
  type: "evaluated";
  requestId: number;
  outcome: PetrinautOptimizationTrialOutcome;
};

/** Stops the running segment; the study stays in memory. */
export type OptimizerCancelMessage = {
  type: "cancel";
  runId: string;
};

/** Drops the kept study; nothing is posted back. */
export type OptimizerReleaseMessage = {
  type: "release";
  runId: string;
};

export type OptimizerToWorkerMessage =
  | OptimizerInitMessage
  | OptimizerStartMessage
  | OptimizerExtendMessage
  | OptimizerEvaluatedMessage
  | OptimizerCancelMessage
  | OptimizerReleaseMessage;

export type OptimizerReadyMessage = {
  type: "ready";
};

export type OptimizerInitErrorMessage = {
  type: "init-error";
  message: string;
};

export type OptimizerEvaluateMessage = {
  type: "evaluate";
  runId: string;
  requestId: number;
  trial: number;
  suggestedValues: Record<string, OptimizationScalar>;
};

export type OptimizerTrialMessage = {
  type: "trial";
  runId: string;
  event: OptimizerTrialPayload;
};

export type OptimizerCompleteMessage = {
  type: "complete";
  runId: string;
  summary: OptimizerStudySummary;
};

export type OptimizerCancelledMessage = {
  type: "cancelled";
  runId: string;
};

export type OptimizerErrorMessage = {
  type: "error";
  runId: string;
  message: string;
};

export type OptimizerToMainMessage =
  | OptimizerReadyMessage
  | OptimizerInitErrorMessage
  | OptimizerEvaluateMessage
  | OptimizerTrialMessage
  | OptimizerCompleteMessage
  | OptimizerCancelledMessage
  | OptimizerErrorMessage;
