import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationTrialOutcome,
} from "../optimization";
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

export type OptimizerStudySummary = {
  requestedTrials: number;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  best: OptimizerBestTrial | null;
  /** Set when the study stopped early because the run was cancelled. */
  cancelled?: boolean;
};

export type OptimizerInitMessage = {
  type: "init";
  pyodide: OptimizerPyodideConfig;
  pythonSources: Readonly<Record<string, string>>;
};

export type OptimizerStartMessage = {
  type: "start";
  runId: string;
  description: PetrinautOptimizationDescribeResult;
};

export type OptimizerEvaluatedMessage = {
  type: "evaluated";
  requestId: number;
  outcome: PetrinautOptimizationTrialOutcome;
};

export type OptimizerCancelMessage = {
  type: "cancel";
  runId: string;
};

export type OptimizerToWorkerMessage =
  | OptimizerInitMessage
  | OptimizerStartMessage
  | OptimizerEvaluatedMessage
  | OptimizerCancelMessage;

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
