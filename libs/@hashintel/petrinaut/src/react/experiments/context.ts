import { createContext } from "react";

import type {
  ExperimentParameterAxis,
  ExperimentParameterInput,
} from "./parameter-grid";
import type { SweepCellSnapshot, SweepSelection } from "./sweep-session";
import type {
  MonteCarloExpressionMetricSpec,
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
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
};

/** Navigator-facing state of a sweep experiment. */
export type ExperimentSweepState = {
  /** Inclusive position range per swept parameter identifier. */
  selection: SweepSelection;
  /** Concrete values of the cell currently being computed, or null. */
  activeCellValues: Readonly<Record<string, number>> | null;
  /** Finished runs across the selected region. */
  runsCompleted: number;
  /** Runs contributing to the shown frames, including the in-flight batch. */
  runsSampled: number;
  /** Cells of the region with at least one finished batch. */
  cellsSampled: number;
  /** Cells inside the selected region. */
  cellsInRegion: number;
  /** Ladder target the in-flight batch climbs its cell to; null when done. */
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
   * Brings a sweep combination up to at least `minRuns` finished runs on the
   * background lane, resolving with its snapshot — the surface view's feed.
   * Resolves null for unknown experiments and disposed sessions.
   */
  sampleSweepCell: (
    experimentId: string,
    parameterValues: Readonly<Record<string, number>>,
    minRuns: number,
  ) => Promise<SweepCellSnapshot | null>;
};

const DEFAULT_CONTEXT_VALUE: ExperimentsContextValue = {
  experiments: [],
  selectedExperimentId: null,
  selectedExperiment: null,
  setSelectedExperimentId: () => {},
  createExperiment: () => Promise.resolve(""),
  cancelExperiment: () => {},
  removeExperiment: () => {},
  setSweepSelection: () => {},
  sampleSweepCell: () => Promise.resolve(null),
};

export const ExperimentsContext = createContext<ExperimentsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
