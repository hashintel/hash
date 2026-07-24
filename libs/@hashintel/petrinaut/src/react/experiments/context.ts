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
  | "complete"
  | "error"
  | "cancelled";

/**
 * Status of a single cell (parameter combination) of an experiment.
 * "pending" cells are waiting for a worker slot.
 */
export type ExperimentCellStatus = ExperimentStatus | "pending";

/**
 * One parameter combination of an experiment's grid: its own Monte Carlo
 * batch with its own progress and per-frame metric distributions. An
 * experiment without ranged parameters has exactly one cell.
 */
export type ExperimentCell = {
  /** Row-major index into the parameter grid (first axis varies slowest). */
  index: number;
  /** Concrete value for each ranged parameter, keyed by identifier. */
  parameterValues: Readonly<Record<string, number>>;
  status: ExperimentCellStatus;
  error: string | null;
  progress: MonteCarloWorkerProgress | null;
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
};

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
};

const DEFAULT_CONTEXT_VALUE: ExperimentsContextValue = {
  experiments: [],
  selectedExperimentId: null,
  selectedExperiment: null,
  setSelectedExperimentId: () => {},
  createExperiment: () => Promise.resolve(""),
  cancelExperiment: () => {},
  removeExperiment: () => {},
};

export const ExperimentsContext = createContext<ExperimentsContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
