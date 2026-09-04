import { createContext } from "react";

import type { ExperimentComputeBackend } from "../experiments/context";
import type { OptimizationSurfaceAxis } from "./surface-grid";
import type {
  MonteCarloUserDefinedMetricFrame,
  PetrinautOptimizationEvent,
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

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
  /**
   * Why the ladder stopped short of its top rung — "8 runs · cannot beat the
   * best" — or null while it climbs, once it reaches the top, or on a trial.
   */
  note: string | null;
};

/** One batch a connected study is computing, for the drawer's activity list. */
export type OptimizationBatchStatus = {
  id: string;
  /** A step's runs, or one rung of the navigated point's refinement ladder. */
  kind: "step" | "refine";
  /** "Step 4", or "Refining population 1850 · infected_ratio 0.36". */
  label: string;
  runCount: number;
  completedRuns: number;
};

/** A step the optimizer is evaluating, with its objective so far. */
export type OptimizationInFlightStep = {
  trial: number;
  parameters: Readonly<Record<string, OptimizationScalar>>;
  /** The running objective, null before the first frame with samples. */
  objective: number | null;
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
   * Whether more steps can be run on the study: a connected study keeps its
   * sampler's history until it is removed, so it is resumable once a segment
   * ends — by completion, or by a stop once its steps in flight are pruned.
   * False for a remote study, and for one that failed.
   */
  resumable: boolean;
  /** Steps a connected study keeps in flight at once; 1 for a remote study. */
  parallelism: number;
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
  /**
   * Every batch a connected study computes right now — the steps in flight
   * and the navigated point's refinement rung. Empty when idle, and always
   * for a remote study.
   */
  activity: readonly OptimizationBatchStatus[];
  /**
   * The steps a connected study is evaluating, most recently started last,
   * each with its running objective. Empty when none is, and always for a
   * remote study.
   */
  inFlight: readonly OptimizationInFlightStep[];
};

const TRIAL_SELECTION_KEY_PREFIX = "trial:";

/** The trial a selection stream follows, or null when the stream is a point's. */
export function followedTrial(selectionKey: string): number | null {
  if (!selectionKey.startsWith(TRIAL_SELECTION_KEY_PREFIX)) {
    return null;
  }
  const trial = Number(selectionKey.slice(TRIAL_SELECTION_KEY_PREFIX.length));
  return Number.isInteger(trial) ? trial : null;
}

export function isOptimizationActive(
  optimization: Pick<OptimizationRecord, "status">,
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
  /**
   * Steps a connected study keeps in flight at once, 1 to
   * `PETRINAUT_OPTIMIZATION_MAX_PARALLELISM`; a remote study ignores it.
   * Defaults to 1.
   */
  parallelism?: number;
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
  /**
   * Stops the study. A remote run is cancelled server-side; a connected
   * study prunes the steps in flight and keeps its sampler's history, so it
   * can be continued.
   */
  cancelOptimization: (optimizationId: string) => void;
  removeOptimization: (optimizationId: string) => void;
  /**
   * Runs `trials` more steps on a resumable connected study, following them
   * as they are evaluated. Rejects for a study that is running, was removed,
   * failed, or would exceed the trial cap; the record's `error` carries the
   * reason as well.
   */
  extendOptimization: (optimizationId: string, trials: number) => Promise<void>;
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
  extendOptimization: () =>
    Promise.reject(new Error("Optimization is unavailable")),
  setOptimizationNavigation: () => {},
  retryOptimization: () => Promise.resolve(null),
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
