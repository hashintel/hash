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

export type OptimizationBest = NonNullable<
  Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
>;

export type OptimizationRecord = {
  id: string;
  input: PetrinautOptimizationInput;
  createdAt: number;
  status: OptimizationStatus;
  error: string | null;
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
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
