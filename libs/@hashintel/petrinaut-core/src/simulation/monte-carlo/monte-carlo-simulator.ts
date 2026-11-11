import { advanceRun } from "./advance-run";
import { createMonteCarloFrameReader } from "./frame-reader";
import {
  createRunState,
  getRunSnapshot,
  summarizeRun,
  summarizeRuns,
} from "./run-state";
import { getFrameTime } from "./time";

import type { MonteCarloRunState } from "./internal-types";
import type { MonteCarloFrameMetric } from "./metrics/types";
import type { MonteCarloRunDriver } from "./run-driver";
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
  /** The runs' drivers, when something other than the fixed step advances them. */
  readonly #drivers: readonly MonteCarloRunDriver[] | null;
  /** Simulated seconds between two samples. */
  readonly #samplePeriod: number;
  readonly #maxTime: number;
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

    const { createRunDriver } = config;
    this.#drivers = createRunDriver
      ? Array.from({ length: config.runCount }, (_, index) =>
          createRunDriver(config, config.runs?.[index], index),
        )
      : null;
    this.#runs = this.#drivers
      ? this.#drivers.map((driver) => driver.run)
      : Array.from({ length: config.runCount }, (_, index) =>
          createRunState(config, config.runs?.[index], index),
        );
    this.#samplePeriod = config.dt;
    this.#maxTime = config.maxTime;
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
   * Advances every active run by at most one frame: one fixed step, or with
   * drivers the stretch to the next sample time.
   *
   * Complete and errored runs are skipped, so repeated calls can drive the
   * simulator until all runs finish without reallocating orchestration state.
   */
  advanceAll(): MonteCarloAdvanceResult {
    let advancedRuns = 0;
    if (this.#drivers) {
      const sampleTime = getFrameTime(
        this.#frameNumber + 1,
        this.#samplePeriod,
      );
      for (const driver of this.#drivers) {
        const { status } = driver.run;
        if (status !== "complete" && status !== "error") {
          driver.advanceTo(sampleTime);
          advancedRuns++;
        }
      }
    } else {
      for (const run of this.#runs) {
        if (advanceRun(run)) {
          advancedRuns++;
        }
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
    // A driven run counts its own steps, so the samples it takes to reach
    // the end are counted from the sample period instead.
    const maxBatches =
      options.maxBatches ??
      Math.max(
        1,
        (this.#drivers
          ? Math.ceil(this.#maxTime / this.#samplePeriod)
          : this.#runs[0]!.maxFrameNumber) + 1,
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
    return this.#summarize(this.getRun(index), index);
  }

  /**
   * Returns a run summary plus current place token counts.
   */
  getRunSnapshot(index: number): MonteCarloRunSnapshot {
    return {
      ...getRunSnapshot(this.getRun(index)),
      ...this.#drivenPosition(index),
    };
  }

  /**
   * Returns stable summaries for all runs.
   */
  getSummaries(): MonteCarloRunSummary[] {
    return this.#runs.map((run, index) => this.#summarize(run, index));
  }

  #summarize(run: MonteCarloRunState, index: number): MonteCarloRunSummary {
    return { ...summarizeRun(run), ...this.#drivenPosition(index) };
  }

  /**
   * Where a driven run stands: the time its driver reached, and the last
   * sample at or before it. A run the simulator steps itself counts its own
   * frames, so nothing is overridden for it.
   */
  #drivenPosition(
    index: number,
  ): Pick<MonteCarloRunSummary, "frameNumber" | "currentTime"> | undefined {
    const driver = this.#drivers?.[index];
    return driver
      ? {
          frameNumber: Math.floor(driver.time / this.#samplePeriod + 1e-9),
          currentTime: driver.time,
        }
      : undefined;
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
        time: getFrameTime(this.#frameNumber, this.#samplePeriod),
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
        forEachRunFrame: (visitor) => {
          for (const [index, run] of this.#runs.entries()) {
            const driven = this.#drivenPosition(index);
            visitor({
              runIndex: run.index,
              status: run.status,
              frame: createMonteCarloFrameReader(
                run,
                driven && {
                  number: driven.frameNumber,
                  time: driven.currentTime,
                },
              ),
            });
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
 * Creates the synchronous Monte Carlo engine controller.
 *
 * Callers drive the returned simulator directly with `advanceAll()` or
 * `runUntilComplete()`, making this API useful for tests, scripts, and custom
 * in-memory metrics where running on the current thread is acceptable.
 */
export function createMonteCarloSimulator(
  config: MonteCarloSimulatorConfig,
): MonteCarloSimulator {
  return new MonteCarloSimulatorImpl(config);
}
