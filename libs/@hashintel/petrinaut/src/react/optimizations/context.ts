import { createContext } from "react";

import type { ExperimentComputeBackend } from "../experiments/context";
import type { ExperimentParameterAxis } from "../experiments/parameter-grid";
import type { BatchStatus } from "../experiments/shared/batch-registry";
import type { OptimizationSurfaceAxis } from "./surface-grid";
import type {
  MonteCarloUserDefinedMetricFrame,
  PetrinautOptimizationDirection,
  PetrinautOptimizationEvent,
  PetrinautOptimizationImportances,
  PetrinautOptimizationInput,
  PetrinautOptimizationTrialEvent,
} from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

/**
 * `paused` is a connected study drained on request: no new steps, the ones
 * in flight finished and reported, the sampler kept. The word is the
 * simulation layer's (`SimulationState` "Paused"), lowercase like its
 * siblings here.
 */
export type OptimizationStatus =
  | "initializing"
  | "running"
  | "paused"
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

/**
 * PED-ANOVA importances as the optimizer last reported them: a share of
 * relative importance per optimized parameter (how concentrated its values
 * are among the best steps relative to its whole range), summing to 1, and
 * the completed trials the estimate was fitted on.
 */
export type OptimizationImportance = PetrinautOptimizationImportances;

/** The most runs a study's navigated point is refined to. */
export const POINT_REFINEMENT_MAX_RUNS = 100;

/** The two axes a study's surface is drawn over. */
export type OptimizationSurfaceView = { xAxisId: string; yAxisId: string };

/** Where a connected study's drawer points: one parameter point, and how the surface looks at it. */
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
  /** The axes the surface shows; unset until the user picks, then kept across presentations. */
  surfaceAxes?: OptimizationSurfaceView;
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

/**
 * One batch a connected study computes: a trial's runs, or one rung of the
 * refinement ladder at the navigated point's optimized parameter values.
 */
export type OptimizationBatch =
  | { kind: "trial"; trial: number }
  | { kind: "refine"; values: Readonly<Record<string, OptimizationScalar>> };

/** A batch as the drawer's activity list receives it, with its progress. */
export type OptimizationBatchStatus = BatchStatus<OptimizationBatch>;

/** A trial the optimizer is evaluating, with its objective so far. */
export type OptimizationInFlightTrial = {
  trial: number;
  parameters: Readonly<Record<string, OptimizationScalar>>;
  /** The running objective, null before the first frame with samples. */
  objective: number | null;
};

/**
 * What a study evaluated in this tab carries beyond its event stream: where
 * its drawer points and what computes there, and what the local run allows.
 */
export type ConnectedStudyState = {
  /** Where the drawer points. */
  navigation: OptimizationNavigation;
  /** The objective's live stream at the navigation or the followed trial. */
  selection: OptimizationSelectionStream | null;
  /**
   * Every batch computing right now — the trials in flight and the navigated
   * point's refinement rung. Empty when idle.
   */
  activity: readonly OptimizationBatchStatus[];
  /**
   * The trials being evaluated, most recently started last, each with its
   * running objective. Empty when none is.
   */
  inFlight: readonly OptimizationInFlightTrial[];
  /**
   * Whether more steps can be run on the study: it keeps its sampler's
   * history until it is removed, so it is resumable once a segment ends — by
   * completion, or by a stop once its terminal event lands. False while it
   * runs, and once it failed.
   */
  resumable: boolean;
  /** Trials the study keeps in flight at once. */
  parallelism: number;
  /**
   * Why the requested backend declined, from the first trial that ran
   * elsewhere; null while every trial ran where asked.
   */
  computeBackendFallbackReason: string | null;
};

/** Where a study was started from, when not the Optimizations tab. */
export type OptimizationOrigin = {
  kind: "sweep";
  /** The parameter-sweep experiment whose compute evaluates the trials. */
  experimentId: string;
};

export type OptimizationRecord = {
  id: string;
  input: PetrinautOptimizationInput;
  createdAt: number;
  /**
   * The experiment the study drives, for a study started from a sweep's
   * Parameters card; null for one created in the Optimizations tab.
   */
  origin: OptimizationOrigin | null;
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
   * The latest importance estimate received on a trial or the complete
   * event; null until the first, and always for a study run on the service.
   */
  importance: OptimizationImportance | null;
  /**
   * The backend the study's trials run on: the one asked for, until the
   * first trial that ran elsewhere reports where. `cpu` for a remote study.
   */
  computeBackend: ExperimentComputeBackend;
  /** The study's navigable axes: its optimized numeric parameters. */
  axes: readonly OptimizationSurfaceAxis[];
  /**
   * The local state of a study evaluated in this tab; null for a remote
   * study, which computes nothing here.
   */
  connected: ConnectedStudyState | null;
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
 * Whether a paused connected study is still computing: its record reads
 * `paused` from the moment Pause is asked, while the steps in flight finish
 * and report, and becomes resumable once the segment's `paused` event lands.
 */
export function isOptimizationDraining(
  optimization: Pick<OptimizationRecord, "status" | "connected">,
): boolean {
  return (
    optimization.status === "paused" &&
    optimization.connected !== null &&
    !optimization.connected.resumable
  );
}

/**
 * The best after one trial event: the best the event carries when it does,
 * else the completed trial itself when its objective beats the one kept, else
 * the one kept. Attachments deliver `best: null` (the service does not know
 * the objective direction once the creating request has ended), so the fold
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
   * Backend a connected study's trials and refinement try first; a remote
   * study ignores it. Defaults to `cpu`.
   */
  computeBackend?: ExperimentComputeBackend;
  /**
   * Trials a connected study keeps in flight at once, 1 to
   * `PETRINAUT_OPTIMIZATION_MAX_PARALLELISM`, fixed for the study's life; a
   * remote study ignores it. Defaults to 1.
   */
  parallelism?: number;
  /**
   * Evaluate the trials through a parameter sweep's compute instead of runs
   * of the study's own: each trial moves the sweep to the suggested point.
   * The study then has no local navigation, opens no drawer, and is not
   * listed in the Optimizations tab; the experiment's drawer is its home.
   */
  sweep?: {
    experimentId: string;
    /** The sweep's axes, one per optimized parameter. */
    axes: readonly ExperimentParameterAxis[];
    /** The experiment metric the objective reads at each point. */
    metricId: string;
  };
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
   * study ends its segment, its trials in flight told failed without an
   * event, and keeps its sampler's history, so it can be continued.
   */
  cancelOptimization: (optimizationId: string) => void;
  /**
   * Drains a running connected study: no new steps are asked, the ones in
   * flight finish and report, and the study keeps its sampler. The record
   * reads `paused` at once and becomes resumable when the segment's
   * `paused` event lands. Nothing computes at the best point (see
   * `refineOptimizationBest`). A remote study ignores the call.
   */
  pauseOptimization: (optimizationId: string) => void;
  /**
   * Runs the steps a paused study still owes (the requested count minus the
   * steps told so far), following them. Rejects as `extendOptimization`
   * does, and when nothing is owed.
   */
  resumeOptimization: (optimizationId: string) => Promise<void>;
  /**
   * Moves a settled connected study's navigation to its best step's point
   * and climbs the run ladder there: the explicit form of what settling used
   * to start on its own. A remote study has no navigation and ignores it.
   */
  refineOptimizationBest: (optimizationId: string) => void;
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
  pauseOptimization: () => {},
  resumeOptimization: () =>
    Promise.reject(new Error("Optimization is unavailable")),
  refineOptimizationBest: () => {},
  removeOptimization: () => {},
  extendOptimization: () =>
    Promise.reject(new Error("Optimization is unavailable")),
  setOptimizationNavigation: () => {},
  retryOptimization: () => Promise.resolve(null),
};

export const OptimizationsContext = createContext<OptimizationsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
