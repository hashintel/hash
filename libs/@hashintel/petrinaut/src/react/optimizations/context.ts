import { createContext } from "react";

import type {
  PetrinautOptimizationEvent,
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";

export type OptimizationStatus =
  | "initializing"
  | "running"
  | "complete"
  | "error"
  | "cancelled";

/** How an optimization transport failure was classified. */
export type OptimizationErrorCategory =
  | "network"
  | "http"
  | "protocol"
  | "aborted";

/** Correlation ids for tracing a failure to the NodeAPI/optimizer logs. */
export type OptimizationErrorDiagnostics = {
  hashRequestId: string | null;
  optimizationRunId: string | null;
  httpStatus: number | null;
};

export type OptimizationBest = NonNullable<
  Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
>;

export type OptimizationRecord = {
  id: string;
  input: PetrinautOptimizationInput;
  createdAt: number;
  status: OptimizationStatus;
  error: string | null;
  /** Set when a transport failure was classified; null otherwise. */
  errorCategory: OptimizationErrorCategory | null;
  /** Correlation ids for a classified failure, for the diagnostic UI. */
  errorDiagnostics: OptimizationErrorDiagnostics | null;
  requestedTrials: number;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  trials: readonly PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
};

export function isOptimizationActive(
  optimization: OptimizationRecord,
): boolean {
  return (
    optimization.status === "initializing" || optimization.status === "running"
  );
}

export type OptimizationsContextValue = {
  optimizations: readonly OptimizationRecord[];
  selectedOptimizationId: string | null;
  selectedOptimization: OptimizationRecord | null;
  setSelectedOptimizationId: (optimizationId: string | null) => void;
  createOptimization: (input: PetrinautOptimizationInput) => Promise<string>;
  cancelOptimization: (optimizationId: string) => void;
  removeOptimization: (optimizationId: string) => void;
  /**
   * Start a fresh optimization from a prior one's input (e.g. after a
   * transport failure). Returns the new id, or null if the record is gone.
   */
  retryOptimization: (optimizationId: string) => Promise<string | null>;
};

const DEFAULT_CONTEXT_VALUE: OptimizationsContextValue = {
  optimizations: [],
  selectedOptimizationId: null,
  selectedOptimization: null,
  setSelectedOptimizationId: () => {},
  createOptimization: () =>
    Promise.reject(new Error("Optimization is unavailable")),
  cancelOptimization: () => {},
  removeOptimization: () => {},
  retryOptimization: () => Promise.resolve(null),
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
