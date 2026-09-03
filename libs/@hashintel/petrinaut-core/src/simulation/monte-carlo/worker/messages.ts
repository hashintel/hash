import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricFrame,
} from "../metrics";
import type { MonteCarloAdvanceResult, MonteCarloRunConfig } from "../types";

export type MonteCarloInitMessage = {
  type: "init";
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  /** Precompiled HIR artifacts (`compileHirArtifacts`) — required for any
   * dynamics/lambda/kernel user code in the net. */
  hirArtifacts?: HirArtifacts;
  /** Number of runs this worker owns — a slice of the experiment when sharded. */
  runCount: number;
  /**
   * Index of this worker's first run within the whole experiment.
   *
   * Seeds derive from the global index, so an experiment sharded across workers
   * runs the same set of seeds as an unsharded one.
   */
  runIndexOffset?: number;
  batchSize?: number;
  metricSpecs?: readonly MonteCarloMetricSpec[];
  /**
   * Per-run overrides for this worker's slice, indexed locally.
   *
   * A sharded experiment slices its full list before sending, so entry 0 here
   * configures the run at global index `runIndexOffset`.
   */
  runs?: readonly MonteCarloRunConfig[];
};

export type MonteCarloStartMessage = {
  type: "start";
};

export type MonteCarloCancelMessage = {
  type: "cancel";
};

export type MonteCarloToWorkerMessage =
  | MonteCarloInitMessage
  | MonteCarloStartMessage
  | MonteCarloCancelMessage;

export type MonteCarloProgressMessage = {
  type: "progress";
  progress: MonteCarloWorkerProgress;
};

export type MonteCarloMetricFramesMessage = {
  type: "metricFrames";
  frames: MonteCarloUserDefinedMetricFrame[];
};

export type MonteCarloReadyMessage = {
  type: "ready";
};

export type MonteCarloCompleteMessage = {
  type: "complete";
  progress: MonteCarloWorkerProgress;
};

export type MonteCarloCancelledMessage = {
  type: "cancelled";
  progress: MonteCarloWorkerProgress | null;
};

export type MonteCarloErrorMessage = {
  type: "error";
  message: string;
  itemId: string | null;
};

/** One run's final metric values, keyed by metric id. */
export type MonteCarloRunResultEntry = {
  /** Global run index — the worker adds its `runIndexOffset`. */
  runIndex: number;
  values: Record<string, number>;
};

/**
 * Posted once, just before `complete`: each run's final-frame metric values.
 *
 * Metric frames aggregate across runs, which is what an experiment chart wants
 * but loses the run axis. Optimization replicates need each run's own
 * objective, so the per-run values travel separately. Runs are disjoint across
 * shards, so the main thread merges by map union — no watermark involved.
 */
export type MonteCarloRunResultsMessage = {
  type: "runResults";
  results: MonteCarloRunResultEntry[];
};

export type MonteCarloWorkerProgress = MonteCarloAdvanceResult & {
  frameNumber: number;
  time: number;
  runCount: number;
};

export type MonteCarloToMainMessage =
  | MonteCarloReadyMessage
  | MonteCarloProgressMessage
  | MonteCarloMetricFramesMessage
  | MonteCarloRunResultsMessage
  | MonteCarloCompleteMessage
  | MonteCarloCancelledMessage
  | MonteCarloErrorMessage;
