import { createContext } from "react";

import type {
  ExperimentParameterAxis,
  ExperimentParameterInput,
} from "./parameter-grid";
import type {
  SweepBatchStatus,
  SweepCellSnapshot,
  SweepSelection,
} from "./sweep-session";

export type { SweepBatchStatus } from "./sweep-session";
import type {
  AdHocScenarioState,
  SDCPN,
  MonteCarloExpressionMetricSpec,
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
  ReadableStore,
} from "@hashintel/petrinaut-core";

export type ExperimentStatus =
  | "initializing"
  | "running"
  /**
   * A sweep whose selected combination is saturated: nothing is computing,
   * but moving the navigator starts computing again. Never terminal.
   */
  | "idle"
  | "complete"
  | "error"
  | "cancelled";

/**
 * Metric spec as authored by the experiment form. Expression metrics are
 * provided without a compiled `artifact` — the experiments provider compiles
 * them through the HIR (in the language worker) before starting the run.
 */
export type ExperimentMetricSpecInput =
  | Exclude<MonteCarloMetricSpec, MonteCarloExpressionMetricSpec>
  | Omit<MonteCarloExpressionMetricSpec, "artifact">;

/**
 * Engine an experiment should try to use.
 *
 * Passed per experiment rather than read from user settings inside the
 * provider, because `UserSettingsProvider` is mounted *inside*
 * `ExperimentsProvider` (see `petrinaut-provider.tsx`) and so is not visible
 * there. The create-experiment surface reads the setting and passes it here.
 */
export type ExperimentComputeBackend = "cpu" | "webgpu";

export type CreateExperimentInput = {
  name: string;
  scenarioId: string | null;
  /**
   * Fixed value or sweep range per scenario parameter.
   *
   * Any `range` entry turns the experiment into a parameter sweep: the ranges
   * define a grid, and only the navigator's selected combination computes.
   */
  scenarioParameterValues: Record<string, ExperimentParameterInput>;
  /**
   * With no scenario selected, an ad-hoc definition compiles through a
   * scenario generated at experiment start and never persisted. Ignored when
   * `scenarioId` is set.
   */
  adHocScenario?: AdHocScenarioState | null;
  /** Number of runs per parameter combination. */
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  metricSpecs: readonly ExperimentMetricSpecInput[];
  /**
   * Backend to attempt. Defaults to `cpu`.
   *
   * `webgpu` is a request, not a guarantee: a net the GPU backend cannot run
   * falls back to the CPU, and `ExperimentRecord.computeBackend` records which
   * one actually ran.
   */
  computeBackend?: ExperimentComputeBackend;
};

export type ExperimentRecord = {
  id: string;
  name: string;
  createdAt: number;
  scenarioId: string | null;
  scenarioName: string | null;
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  status: ExperimentStatus;
  error: string | null;
  metricSpecs: readonly ExperimentMetricSpecInput[];
  /**
   * Backend that actually ran this experiment.
   *
   * Recorded because the two are not numerically interchangeable — the GPU
   * backend uses a different random generator, so the same seed gives different
   * (statistically equivalent) trajectories.
   */
  computeBackend: ExperimentComputeBackend;
  /** Why the GPU backend was not used, when `webgpu` was requested but declined. */
  computeBackendFallbackReason: string | null;
  /**
   * When stepping began — i.e. when the engine handle was started, after user
   * code compiled and the workers (or the GPU device and shader) were ready.
   *
   * Deliberately later than `createdAt`: setup cost differs between backends,
   * so including it would make the two look different for reasons that have
   * nothing to do with how fast they simulate. `null` until stepping starts,
   * which is also the case for an experiment that fails during setup.
   */
  startedAt: number | null;
  /**
   * When the experiment reached a terminal status, whether that was completion,
   * an error or cancellation. `null` while it is still active.
   */
  finishedAt: number | null;
  progress: MonteCarloWorkerProgress | null;
  /**
   * For a sweep: the *selected combination's* frames (finished batches merged
   * with the in-flight batch). For a plain experiment: the whole run's frames.
   */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  latestMetricFramesById: Readonly<
    Record<string, MonteCarloUserDefinedMetricFrame>
  >;
  /**
   * The swept parameters' discrete values; empty for a plain experiment.
   * Order matches the scenario's parameter order and is the navigator's row
   * order.
   */
  parameterAxes: readonly ExperimentParameterAxis[];
  /** Live sweep state; null for a plain experiment. */
  sweep: ExperimentSweepState | null;
  /**
   * Every batch the sweep session is computing right now — the selection's
   * own ladder rungs plus the background surface and refine batches. Empty
   * for a plain experiment and whenever nothing computes.
   */
  sweepBatches: readonly SweepBatchStatus[];
};

/** Navigator-facing state of a sweep experiment. */
export type ExperimentSweepState = {
  /** Inclusive position range per swept parameter identifier. */
  selection: SweepSelection;
  /** Finished runs for the selection. */
  runsCompleted: number;
  /** Runs contributing to the shown frames, including the in-flight batch. */
  runsSampled: number;
  /** Ladder target the in-flight batch climbs to; null when saturated. */
  runTarget: number | null;
  computing: boolean;
};

/** Whether a status is one an experiment can never leave. */
export function isTerminalExperimentStatus(status: ExperimentStatus): boolean {
  return status === "complete" || status === "error" || status === "cancelled";
}

export function isExperimentActive(experiment: ExperimentRecord): boolean {
  // "idle" is deliberately not active: an idle sweep computes nothing, so it
  // neither blocks closing the window nor keeps elapsed-time tickers running.
  return (
    experiment.status === "initializing" || experiment.status === "running"
  );
}

/**
 * Wall-clock milliseconds the experiment has been stepping: up to `now` while it
 * is still running, and up to the moment it finished once it is not.
 *
 * `null` when stepping never began, so callers can distinguish "no time yet"
 * from "zero time" — an experiment that failed while compiling has no runtime to
 * report, rather than a runtime of 0.
 */
export function getExperimentElapsedMs(
  experiment: ExperimentRecord,
  now: number,
): number | null {
  if (experiment.startedAt === null) {
    return null;
  }

  return Math.max(0, (experiment.finishedAt ?? now) - experiment.startedAt);
}

export type ExperimentsContextValue = {
  experiments: readonly ExperimentRecord[];
  selectedExperimentId: string | null;
  selectedExperiment: ExperimentRecord | null;
  setSelectedExperimentId: (experimentId: string | null) => void;
  createExperiment: (input: CreateExperimentInput) => Promise<string>;
  cancelExperiment: (experimentId: string) => void;
  removeExperiment: (experimentId: string) => void;
  /** Moves a sweep's navigator; compute follows the selection. */
  setSweepSelection: (experimentId: string, selection: SweepSelection) => void;
  /**
   * Samples sweep-surface cells to `runsPerCell` runs each and returns each
   * cell's per-metric mean, index-aligned with `positions` (null entries for
   * cells with no finished runs). Waits for the navigator's own selection to
   * stream first. One batch when the cells share an initial marking; the
   * per-cell path otherwise. Resolves null with no session.
   */
  sampleSurfaceCells: (
    experimentId: string,
    positions: readonly Readonly<Record<string, number>>[],
    runsPerCell: number,
    onPartial?: (
      cells: readonly (Readonly<Record<string, number>> | null)[],
    ) => void,
  ) => Promise<readonly (Readonly<Record<string, number>> | null)[] | null>;
  /**
   * Computes one metric sample against an arbitrary net snapshot, on the
   * background single-worker lane — the optimization surface's local compute
   * path, which must run a study's frozen model rather than the live editor
   * net. Batches are serialized; compilation is cached per `cacheKey`.
   * Resolves null when the batch is refused or fails (a hole in the surface,
   * not an error).
   */
  sampleDetachedObjective: (
    request: DetachedObjectiveRequest,
  ) => Promise<SweepCellSnapshot | null>;
  /**
   * Streams one batch of a study's objective at one parameter point on the
   * requested backend: the in-browser optimizer's trials and the study
   * drawer's selected-point refinement. Batches queue per `cacheKey` so a
   * study's trials stay ordered; different studies run side by side. The
   * returned run never rejects — refusal, failure and cancellation all
   * settle `completion` with a failed outcome naming the reason.
   */
  runDetachedObjective: (
    request: DetachedObjectiveRunRequest,
  ) => DetachedObjectiveRun;
};

/** One local compute batch for an optimization study's objective. */
export type DetachedObjectiveRequest = {
  /** Compile-cache identity; one study keeps one compiled snapshot. */
  cacheKey: string;
  /** The frozen model snapshot to run (not the live editor net). */
  definition: SDCPN;
  scenarioId: string;
  /** Parsed values for every scenario parameter (bindings plus navigation). */
  scenarioParameterValues: Readonly<Record<string, number | boolean>>;
  /** The study's objective metric, evaluated as an expression metric. */
  metric: { id: string; label: string; code: string };
  seed: number;
  runCount: number;
  dt: number;
  maxTime: number;
};

export type DetachedObjectiveRunRequest = DetachedObjectiveRequest & {
  /**
   * Pinned per-run seeds, `runCount` long; CPU only. Absent (and always on
   * the GPU, which derives every run's seed from `seed`), runs derive their
   * seeds from `seed`.
   */
  runSeeds?: readonly number[];
  computeBackend: ExperimentComputeBackend;
  signal?: AbortSignal;
};

export type DetachedObjectiveRunResult = {
  runsCompleted: number;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  /** Per-run final metric values; empty on the GPU, which reports no run axis. */
  runResults: ReadonlyMap<number, Readonly<Record<string, number>>>;
  /** Where the batch ran. */
  computeBackend: ExperimentComputeBackend;
  /** Why the requested backend declined, when the batch ran elsewhere. */
  computeBackendFallbackReason: string | null;
};

/**
 * How a batch ended. A failure carries a reason the user can act on: the
 * diagnostics of a metric that did not compile, each backend that declined
 * and why, how many runs errored. `cancelled` marks a batch stopped through
 * `cancel` or the request's signal, which nobody needs to act on.
 */
export type DetachedObjectiveRunOutcome =
  | ({ readonly ok: true } & DetachedObjectiveRunResult)
  | {
      readonly ok: false;
      readonly reason: string;
      readonly cancelled: boolean;
    };

/** One streaming batch for a study's objective at one parameter point. */
export type DetachedObjectiveRun = {
  /** Frames so far; replaced as the batch streams, at most every 100 ms. */
  readonly frames: ReadableStore<readonly MonteCarloUserDefinedMetricFrame[]>;
  readonly progress: ReadableStore<MonteCarloWorkerProgress | null>;
  /** Settles on the terminal event; never rejects. */
  readonly completion: Promise<DetachedObjectiveRunOutcome>;
  cancel(this: void): void;
};

const constantStore = <T>(value: T): ReadableStore<T> => ({
  get: () => value,
  subscribe: () => () => {},
});

const DEFAULT_CONTEXT_VALUE: ExperimentsContextValue = {
  experiments: [],
  selectedExperimentId: null,
  selectedExperiment: null,
  setSelectedExperimentId: () => {},
  createExperiment: () => Promise.resolve(""),
  cancelExperiment: () => {},
  removeExperiment: () => {},
  setSweepSelection: () => {},
  sampleSurfaceCells: () => Promise.resolve(null),
  sampleDetachedObjective: () => Promise.resolve(null),
  runDetachedObjective: () => ({
    frames: constantStore([]),
    progress: constantStore(null),
    completion: Promise.resolve({
      ok: false,
      cancelled: false,
      reason: "Experiments are unavailable",
    }),
    cancel: () => {},
  }),
};

export const ExperimentsContext = createContext<ExperimentsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);

/**
 * The stable action callbacks alone. Streaming experiments patch the full
 * context on every publish; a consumer that only dispatches actions (the
 * editor view opening a drawer, say) subscribes here instead and never
 * re-renders with the stream.
 */
export type ExperimentsActionsValue = Pick<
  ExperimentsContextValue,
  | "setSelectedExperimentId"
  | "createExperiment"
  | "cancelExperiment"
  | "removeExperiment"
  | "setSweepSelection"
  | "sampleSurfaceCells"
  | "sampleDetachedObjective"
  | "runDetachedObjective"
>;

export const ExperimentsActionsContext = createContext<ExperimentsActionsValue>(
  DEFAULT_CONTEXT_VALUE,
);
