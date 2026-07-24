import { createContext } from "react";

import type {
  ExperimentParameterAxis,
  ExperimentParameterInput,
} from "./parameter-grid";
import type {
  MonteCarloExpressionMetricSpec,
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

export type ExperimentStatus =
  | "initializing"
  | "running"
  | "idle"
  | "complete"
  | "error"
  | "cancelled";

/**
 * Status of a single cell (parameter combination) of an experiment.
 * "pending" cells are waiting for a worker slot; "idle" cells have
 * accumulated some runs and are waiting to be viewed before refining
 * further.
 */
export type ExperimentCellStatus = ExperimentStatus | "pending";

/**
 * One parameter combination of an experiment's grid, accumulating Monte
 * Carlo runs in progressively larger batches. An experiment without ranged
 * parameters has exactly one cell (run as a single full batch).
 */
export type ExperimentCell = {
  /** Row-major index into the parameter grid (first axis varies slowest). */
  index: number;
  /** Concrete value for each ranged parameter, keyed by identifier. */
  parameterValues: Readonly<Record<string, number>>;
  status: ExperimentCellStatus;
  error: string | null;
  progress: MonteCarloWorkerProgress | null;
  /** Runs accumulated across completed batches. */
  runsCompleted: number;
  /** Merged metric frames of all completed batches. */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  /**
   * Live frames of the batch currently computing (discarded if the batch is
   * interrupted, merged into `metricFrames` when it completes). Display code
   * should merge these with `metricFrames`.
   */
  inFlightMetricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

/**
 * The parameter selection currently viewed in an experiment's results
 * drawer: per ranged parameter, the pinned value index or null when the
 * parameter is combined. A null focus means the results are not being
 * viewed at all.
 */
export type ExperimentRunFocus = Readonly<Record<string, number | null>>;

/**
 * Metric spec as authored by the experiment form. Expression metrics are
 * provided without a compiled `artifact` — the experiments provider compiles
 * them through the HIR (in the language worker) before starting the run.
 */
export type ExperimentMetricSpecInput =
  | Exclude<MonteCarloMetricSpec, MonteCarloExpressionMetricSpec>
  | Omit<MonteCarloExpressionMetricSpec, "artifact">;

export type CreateExperimentInput = {
  name: string;
  scenarioId: string | null;
  /**
   * Per scenario-parameter input: a fixed value or a range to sweep. Ranged
   * parameters expand into a grid — one cell (Monte Carlo batch) per
   * combination.
   */
  scenarioParameterValues: Record<string, ExperimentParameterInput>;
  /** Number of runs per parameter combination. */
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  metricSpecs: readonly ExperimentMetricSpecInput[];
};

export type ExperimentRecord = {
  id: string;
  name: string;
  createdAt: number;
  scenarioId: string | null;
  scenarioName: string | null;
  /** Number of runs per cell (parameter combination). */
  runCount: number;
  seed: number;
  dt: number;
  maxTime: number;
  status: ExperimentStatus;
  error: string | null;
  metricSpecs: readonly ExperimentMetricSpecInput[];
  /** Ranged parameters spanning the grid; empty when every parameter is fixed. */
  parameterAxes: readonly ExperimentParameterAxis[];
  /** One cell per parameter combination (a single cell without ranges). */
  cells: readonly ExperimentCell[];
  /** Aggregated across cells (the cell's own progress when there is one cell). */
  progress: MonteCarloWorkerProgress | null;
  /**
   * Mirrors the single cell's frames when the experiment has no ranged
   * parameters; empty for grid experiments (read per-cell frames from
   * `cells` and merge with `mergeMetricFramesAcrossCells` instead).
   */
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  latestMetricFramesById: Readonly<
    Record<string, MonteCarloUserDefinedMetricFrame>
  >;
};

export function isExperimentActive(experiment: ExperimentRecord): boolean {
  return (
    experiment.status === "initializing" || experiment.status === "running"
  );
}

export type ExperimentsContextValue = {
  experiments: readonly ExperimentRecord[];
  selectedExperimentId: string | null;
  selectedExperiment: ExperimentRecord | null;
  setSelectedExperimentId: (experimentId: string | null) => void;
  createExperiment: (input: CreateExperimentInput) => Promise<string>;
  cancelExperiment: (experimentId: string) => void;
  removeExperiment: (experimentId: string) => void;
  /**
   * Tells the scheduler which parameter selection is currently viewed, so
   * grid experiments refine the combinations in view. Pass null when the
   * results stop being viewed (refinement pauses).
   */
  setExperimentRunFocus: (
    experimentId: string,
    focus: ExperimentRunFocus | null,
  ) => void;
};

const DEFAULT_CONTEXT_VALUE: ExperimentsContextValue = {
  experiments: [],
  selectedExperimentId: null,
  selectedExperiment: null,
  setSelectedExperimentId: () => {},
  createExperiment: () => Promise.resolve(""),
  cancelExperiment: () => {},
  removeExperiment: () => {},
  setExperimentRunFocus: () => {},
};

export const ExperimentsContext = createContext<ExperimentsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
