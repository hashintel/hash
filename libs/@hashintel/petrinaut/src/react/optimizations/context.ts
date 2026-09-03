import { createContext } from "react";

import type { ExperimentComputeBackend } from "../experiments/context";
import type { OptimizationSurfaceAxis } from "./surface-grid";
import type {
  MonteCarloUserDefinedMetricFrame,
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

/**
 * Live transport state of a detached run's event stream. `streaming` while
 * events are flowing; `reconnecting` while a dropped connection is being
 * re-established with backoff. `null` for legacy single-connection runs and
 * once a run reaches a terminal status.
 */
export type OptimizationConnectionState = "streaming" | "reconnecting";

export type OptimizationBest = NonNullable<
  Extract<PetrinautOptimizationEvent, { type: "complete" }>["best"]
>;

/** Where a connected study's drawer points: one parameter point. */
export type OptimizationNavigation = {
  /** Axis position (0..stepCount) per optimized numeric parameter identifier. */
  positions: Readonly<Record<string, number>>;
  /** Value per optimized boolean parameter identifier. */
  booleans: Readonly<Record<string, boolean>>;
  /**
   * While true, the navigation follows each trial as it is evaluated. On at
   * creation; cleared by a user move.
   */
  followTrials: boolean;
};

/** The objective's live metric stream at the navigation, or at the followed trial. */
export type OptimizationSelectionStream = {
  /**
   * `trial:<n>` while following a trial; otherwise the navigation key
   * (positions in axis order, then booleans).
   */
  key: string;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  runsCompleted: number;
  /**
   * Ladder target the in-flight batch climbs to; null when saturated or
   * while following a trial.
   */
  runTarget: number | null;
  computing: boolean;
  /**
   * Why the last batch at this key failed — the metric's compile
   * diagnostics, the backend's refusal, the count of errored runs — so the
   * drawer can say what to fix. Null while computing and once a batch has
   * succeeded; a cancellation records nothing.
   */
  error: string | null;
};

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
  /** Server-issued id of a detached run; null for legacy streaming runs. */
  runId: string | null;
  /**
   * Highest server-issued event sequence number applied to this record. A
   * reconnect resumes the event stream from this cursor, and replayed events
   * at or below it are skipped so trials are never double-counted.
   */
  lastSeq: number;
  /** Transport state of a detached run's event stream; null otherwise. */
  connectionState: OptimizationConnectionState | null;
  requestedTrials: number;
  completedTrials: number;
  prunedTrials: number;
  failedTrials: number;
  trials: readonly PetrinautOptimizationTrialEvent[];
  best: OptimizationBest | null;
  /**
   * The backend the study's trials run on: the one asked for, until the
   * first trial that ran elsewhere reports where. `cpu` for a remote study.
   */
  computeBackend: ExperimentComputeBackend;
  /**
   * Why the requested backend declined, from the first trial that ran
   * elsewhere; null while every trial ran where asked.
   */
  computeBackendFallbackReason: string | null;
  /** The study's navigable axes: its optimized numeric parameters. */
  axes: readonly OptimizationSurfaceAxis[];
  /**
   * Where the drawer points; null for a remote study, which computes nothing
   * locally.
   */
  navigation: OptimizationNavigation | null;
  /**
   * The objective's live stream at the navigation or the followed trial;
   * null for a remote study.
   */
  selection: OptimizationSelectionStream | null;
};

export function isOptimizationActive(
  optimization: OptimizationRecord,
): boolean {
  return (
    optimization.status === "initializing" || optimization.status === "running"
  );
}

export type CreateOptimizationOptions = {
  /**
   * Backend a connected study's trials and refinement try first; a remote
   * study ignores it. Defaults to `cpu`.
   */
  computeBackend?: ExperimentComputeBackend;
};

export type OptimizationsContextValue = {
  optimizations: readonly OptimizationRecord[];
  selectedOptimizationId: string | null;
  selectedOptimization: OptimizationRecord | null;
  setSelectedOptimizationId: (optimizationId: string | null) => void;
  createOptimization: (
    input: PetrinautOptimizationInput,
    options?: CreateOptimizationOptions,
  ) => Promise<string>;
  cancelOptimization: (optimizationId: string) => void;
  removeOptimization: (optimizationId: string) => void;
  /**
   * Moves a connected study's navigation. A position or boolean change stops
   * following trials, and the selection refines at the new point; a remote
   * study has no navigation and ignores the call.
   */
  setOptimizationNavigation: (
    optimizationId: string,
    patch: Partial<OptimizationNavigation>,
  ) => void;
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
  setOptimizationNavigation: () => {},
  retryOptimization: () => Promise.resolve(null),
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
