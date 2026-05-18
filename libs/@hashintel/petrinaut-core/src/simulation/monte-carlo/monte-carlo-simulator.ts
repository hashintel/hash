import { advanceRun } from "./advance-run";
import type { MonteCarloRunState } from "./internal-types";
import {
  createRunState,
  getRunSnapshot,
  summarizeRun,
  summarizeRuns,
} from "./run-state";
import { getFrameTime } from "./time";
import type {
  MonteCarloAdvanceResult,
  MonteCarloRunSnapshot,
  MonteCarloRunSummary,
  MonteCarloRunUntilCompleteOptions,
  MonteCarloSimulator,
  MonteCarloSimulatorConfig,
} from "./types";
import type { MonteCarloFrameMetric } from "./metrics/types";

/**
 * Coordinates a fixed set of independent Monte Carlo runs.
 *
 * The implementation keeps one mutable run state per run and advances them in
 * batches. It exposes only summaries/snapshots so frame buffer representation
 * stays internal to the core simulation layer.
 */
class MonteCarloSimulatorImpl implements MonteCarloSimulator {
  readonly #runs: MonteCarloRunState[];
  readonly #metrics: readonly MonteCarloFrameMetric[];
  readonly #placeIds: readonly string[];
  readonly #placeNames: readonly string[];
  #frameNumber = 0;

  /**
   * Validates simulator-level configuration and creates all run states.
   */
  constructor(config: MonteCarloSimulatorConfig) {
    if (!Number.isInteger(config.runCount) || config.runCount <= 0) {
      throw new Error(
        "MonteCarloSimulator requires a positive integer runCount",
      );
    }
    if (!Number.isFinite(config.dt) || config.dt <= 0) {
      throw new Error("MonteCarloSimulator requires a positive dt");
    }
    if (!Number.isFinite(config.maxTime) || config.maxTime < 0) {
      throw new Error("MonteCarloSimulator requires a finite maxTime >= 0");
    }
    if (config.runs && config.runs.length > config.runCount) {
      throw new Error(
        "MonteCarloSimulator received more run configs than runCount",
      );
    }

    this.#runs = Array.from({ length: config.runCount }, (_, index) =>
      createRunState(config, config.runs?.[index], index),
    );
    const firstRun = this.#runs[0]!;
    this.#metrics = config.metrics ?? [];
    this.#placeIds = firstRun.simulation.frameLayout.placeIds;
    this.#placeNames = this.#placeIds.map(
      (placeId) => firstRun.simulation.places.get(placeId)?.name ?? placeId,
    );
    this.observeMetricFrame();
  }

  /**
   * Returns the number of configured Monte Carlo runs.
   */
  get runCount(): number {
    return this.#runs.length;
  }

  /**
   * Advances every active run by at most one frame.
   *
   * Complete and errored runs are skipped, so repeated calls can drive the
   * simulator until all runs finish without reallocating orchestration state.
   */
  advanceAll(): MonteCarloAdvanceResult {
    let advancedRuns = 0;
    for (const run of this.#runs) {
      if (advanceRun(run)) {
        advancedRuns++;
      }
    }

    if (advancedRuns > 0) {
      this.#frameNumber++;
      this.observeMetricFrame();
    }

    return summarizeRuns(this.#runs, advancedRuns);
  }

  /**
   * Advances batches until all runs finish or the optional batch cap is hit.
   */
  runUntilComplete(
    options: MonteCarloRunUntilCompleteOptions = {},
  ): MonteCarloAdvanceResult {
    const maxBatches =
      options.maxBatches ?? Math.max(1, this.#runs[0]!.maxFrameNumber + 1);
    let result = summarizeRuns(this.#runs, 0);

    for (let batch = 0; batch < maxBatches && !result.allFinished; batch++) {
      result = this.advanceAll();
    }

    return result;
  }

  /**
   * Returns a stable summary for one run without exposing its frame buffer.
   */
  getRunSummary(index: number): MonteCarloRunSummary {
    return summarizeRun(this.getRun(index));
  }

  /**
   * Returns a run summary plus current place token counts.
   */
  getRunSnapshot(index: number): MonteCarloRunSnapshot {
    return getRunSnapshot(this.getRun(index));
  }

  /**
   * Returns stable summaries for all runs.
   */
  getSummaries(): MonteCarloRunSummary[] {
    return this.#runs.map((run) => summarizeRun(run));
  }

  /**
   * Streams the current frame to configured metrics.
   */
  private observeMetricFrame(): void {
    if (this.#metrics.length === 0) {
      return;
    }

    let activeRunCount = 0;
    let completedRunCount = 0;
    let erroredRunCount = 0;

    for (const run of this.#runs) {
      if (run.status === "complete") {
        completedRunCount++;
      } else if (run.status === "error") {
        erroredRunCount++;
      } else {
        activeRunCount++;
      }
    }

    for (const metric of this.#metrics) {
      metric.observeFrame({
        frameNumber: this.#frameNumber,
        time: getFrameTime(this.#frameNumber, this.#runs[0]!.simulation.dt),
        runCount: this.#runs.length,
        activeRunCount,
        completedRunCount,
        erroredRunCount,
        placeIds: this.#placeIds,
        placeNames: this.#placeNames,
        forEachActiveRunPlaceCounts: (visitor) => {
          for (const run of this.#runs) {
            if (run.status !== "complete" && run.status !== "error") {
              visitor(run.index, run.currentFrame.placeCounts);
            }
          }
        },
      });
    }
  }

  /**
   * Looks up an internal run state and validates the requested index.
   */
  private getRun(index: number): MonteCarloRunState {
    const run = this.#runs[index];
    if (!run) {
      throw new Error(`Monte Carlo run ${index} does not exist`);
    }

    return run;
  }
}

/**
 * Creates a Monte Carlo simulator from an SDCPN and run configuration.
 */
export function createMonteCarloSimulator(
  config: MonteCarloSimulatorConfig,
): MonteCarloSimulator {
  return new MonteCarloSimulatorImpl(config);
}
