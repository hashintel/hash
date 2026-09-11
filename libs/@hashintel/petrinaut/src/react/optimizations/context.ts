import { createContext } from "react";

import type { ExperimentParameterAxis } from "../experiments/parameter-grid";
import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationEvent,
  PetrinautOptimizationImportances,
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

export type OptimizationStatus =
  | "initializing"
  | "running"
  | "complete"
  | "error"
  | "cancelled";

export type OptimizationBest = NonNullable<
  Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
>;

/**
 * PED-ANOVA importances as the optimizer last reported them: a share of
 * relative importance per optimized parameter (how concentrated its values
 * are among the best steps relative to its whole range), summing to 1, and
 * the completed trials the estimate was fitted on.
 */
export type OptimizationImportance = PetrinautOptimizationImportances;

/** Where a study was started from: every study drives a parameter sweep. */
export type OptimizationOrigin = {
  kind: "sweep";
  /** The parameter-sweep experiment whose compute evaluates the trials. */
  experimentId: string;
};

export type OptimizationRecord = {
  id: string;
  input: PetrinautOptimizationInput;
  createdAt: number;
  /** The experiment the study drives from its Parameters card. */
  origin: OptimizationOrigin;
  status: OptimizationStatus;
  error: string | null;
  /** The optimizer's id for the study's run; null until creation resolves. */
  runId: string | null;
  /**
   * Highest event sequence number applied to this record; replayed events at
   * or below it are skipped so trials are never double-counted.
   */
  lastSeq: number;
  requestedTrials: number;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  trials: readonly PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
  /**
   * The latest importance estimate received on a trial or the complete
   * event; null until the first.
   */
  importance: OptimizationImportance | null;
};

export function isOptimizationActive(
  optimization: Pick<OptimizationRecord, "status">,
): boolean {
  return (
    optimization.status === "initializing" || optimization.status === "running"
  );
}

/** Trials the study is done with, whatever their outcome. */
export const finishedTrialCount = (
  optimization: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials"
  >,
): number =>
  optimization.completedTrials +
  optimization.prunedTrials +
  optimization.failedTrials;

/** The 1-based number of the trial the study is on, never past the last one requested. */
export const currentTrialNumber = (
  optimization: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials" | "requestedTrials"
  >,
): number =>
  Math.min(optimization.requestedTrials, finishedTrialCount(optimization) + 1);

/**
 * The best after one trial event: the best the event carries when it does,
 * else the completed trial itself when its objective beats the one kept, else
 * the one kept. The worker's trial events carry `best: null`, so the fold
 * keeps the best itself from every trial it applies.
 */
export const foldBestTrial = (
  direction: PetrinautOptimizationDirection,
  best: OptimizationBest | null,
  event: PetrinautOptimizationTrialEvent,
): OptimizationBest | null => {
  if (event.best) {
    return event.best;
  }
  if (event.state !== "complete" || event.objective === null) {
    return best;
  }
  const isBetter =
    best === null ||
    (direction === "maximize"
      ? event.objective > best.objective
      : event.objective < best.objective);
  return isBetter
    ? {
        trial: event.trial,
        parameters: event.parameters,
        objective: event.objective,
      }
    : best;
};

export type CreateOptimizationOptions = {
  /**
   * The parameter sweep whose compute evaluates the trials: each trial moves
   * the sweep to the suggested point and reads the metric there. The
   * experiment's drawer is the study's home.
   */
  sweep: {
    experimentId: string;
    /** The sweep's axes, one per optimized parameter. */
    axes: readonly ExperimentParameterAxis[];
    /** The experiment metric the objective reads at each point. */
    metricId: string;
  };
};

export type OptimizationsContextValue = {
  optimizations: readonly OptimizationRecord[];
  /**
   * Starts a study driving a sweep. Rejects when no in-browser optimizer is
   * connected: a sweep can only be optimized in the browser.
   */
  createOptimization: (
    input: PetrinautOptimizationInput,
    options: CreateOptimizationOptions,
  ) => Promise<string>;
  /**
   * Stops the study: its segment ends, the trial in flight is told failed
   * without an event, and the sweep parks on the point it was trying.
   */
  cancelOptimization: (optimizationId: string) => void;
  /** Discards the study and releases the optimizer's run. */
  removeOptimization: (optimizationId: string) => void;
};

const DEFAULT_CONTEXT_VALUE: OptimizationsContextValue = {
  optimizations: [],
  createOptimization: () =>
    Promise.reject(new Error("Optimization is unavailable")),
  cancelOptimization: () => {},
  removeOptimization: () => {},
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
