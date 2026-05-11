import { advanceRun } from "./advance-run";
import type { MonteCarloRunState } from "./internal-types";
import {
  createRunState,
  getRunSnapshot,
  summarizeRun,
  summarizeRuns,
} from "./run-state";
import type {
  MonteCarloAdvanceResult,
  MonteCarloRunSnapshot,
  MonteCarloRunSummary,
  MonteCarloRunUntilCompleteOptions,
  MonteCarloSimulator,
  MonteCarloSimulatorConfig,
} from "./types";

/**
 * Coordinates a fixed set of independent Monte Carlo runs.
 *
 * The implementation keeps one mutable run state per run and advances them in
 * batches. It exposes only summaries/snapshots so frame buffer representation
 * stays internal to the core simulation layer.
 */
class MonteCarloSimulatorImpl implements MonteCarloSimulator {
  readonly #runs: MonteCarloRunState[];

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

    return summarizeRuns(this.#runs, advancedRuns);
  }

  /**
   * Advances batches until all runs finish or the optional batch cap is hit.
   */
  runUntilComplete(
    options: MonteCarloRunUntilCompleteOptions = {},
  ): MonteCarloAdvanceResult {
    const maxBatches =
      options.maxBatches ??
      Math.max(
        1,
        Math.ceil(
          this.#runs[0]!.simulation.maxTime! / this.#runs[0]!.simulation.dt,
        ) + 1,
      );
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
