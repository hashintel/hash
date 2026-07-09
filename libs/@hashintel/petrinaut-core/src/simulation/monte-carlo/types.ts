import type { PetrinautExtensionSettings } from "../../extensions";
import type { SDCPN } from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { SimulationCompletionReason } from "../engine/compute-next-frame";
import type { ParameterValues } from "../engine/types";
import type { MonteCarloFrameMetric } from "./metrics/types";

export type MonteCarloRunStatus = "ready" | "running" | "complete" | "error";

export type MonteCarloRunConfig = {
  seed?: number;
  parameterValues?: Record<string, string>;
  initialMarking?: InitialMarking;
};

export type MonteCarloSimulatorConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  runCount: number;
  initialMarking: InitialMarking;
  parameterValues?: Record<string, string>;
  seed?: number;
  dt: number;
  maxTime: number;
  runs?: readonly MonteCarloRunConfig[];
  /** Initial token region capacity per run, in bytes. */
  initialTokenByteCapacity?: number;
  metrics?: readonly MonteCarloFrameMetric[];
};

export type MonteCarloRunSummary = {
  index: number;
  status: MonteCarloRunStatus;
  seed: number;
  frameNumber: number;
  currentTime: number;
  rngState: number;
  parameterValues: ParameterValues;
  completionReason: SimulationCompletionReason | null;
  error: string | null;
  /** Used token region length of the current frame, in bytes. */
  tokenByteCount: number;
  /** Allocated token region capacity of the current frame, in bytes. */
  tokenByteCapacity: number;
  reallocations: number;
};

export type MonteCarloRunSnapshot = MonteCarloRunSummary & {
  placeTokenCounts: Record<string, number>;
};

export type MonteCarloAdvanceResult = {
  advancedRuns: number;
  completedRuns: number;
  erroredRuns: number;
  activeRuns: number;
  allFinished: boolean;
};

export type MonteCarloRunUntilCompleteOptions = {
  maxBatches?: number;
};

/**
 * Public controller for a memory-bounded Monte Carlo simulation.
 *
 * Implementations should keep binary frame buffers internal and expose only
 * serializable summaries or snapshots to callers.
 */
export interface MonteCarloSimulator {
  readonly runCount: number;
  /**
   * Advance every active run by at most one simulation frame.
   */
  advanceAll(): MonteCarloAdvanceResult;
  /**
   * Keep advancing runs until every run is complete/errored or a batch cap is
   * reached.
   */
  runUntilComplete(
    options?: MonteCarloRunUntilCompleteOptions,
  ): MonteCarloAdvanceResult;
  /**
   * Read progress and capacity metadata for one run.
   */
  getRunSummary(index: number): MonteCarloRunSummary;
  /**
   * Read one run summary plus current place token counts.
   */
  getRunSnapshot(index: number): MonteCarloRunSnapshot;
  /**
   * Read progress and capacity metadata for every run.
   */
  getSummaries(): MonteCarloRunSummary[];
}
