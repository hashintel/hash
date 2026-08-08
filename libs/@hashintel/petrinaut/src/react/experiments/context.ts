import { createContext } from "react";

import type {
  AdHocScenarioState,
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
  scenarioParameterValues: Record<string, string>;
  /**
   * With no scenario selected, an ad-hoc definition compiles through a
   * scenario generated at experiment start and never persisted. Ignored when
   * `scenarioId` is set.
   */
  adHocScenario?: AdHocScenarioState | null;
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
  metricFrames: readonly MonteCarloUserDefinedMetricFrame[];
  latestMetricFramesById: Readonly<
    Record<string, MonteCarloUserDefinedMetricFrame>
  >;
};

/** Whether a status is one an experiment can never leave. */
export function isTerminalExperimentStatus(status: ExperimentStatus): boolean {
  return status === "complete" || status === "error" || status === "cancelled";
}

export function isExperimentActive(experiment: ExperimentRecord): boolean {
  return !isTerminalExperimentStatus(experiment.status);
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
