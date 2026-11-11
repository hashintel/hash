import type { ReadableStore } from "../../store";
import type { SDCPN } from "../../types/sdcpn";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetricDistributionBin,
  MonteCarloUserDefinedMetricFrame,
} from "../monte-carlo/metrics/types";
import type { MonteCarloExperimentMetrics } from "../monte-carlo/runtime/experiment-stores";

/** The id of the metric that carries a place's token count across runs. */
export const placeCountMetricId = (placeId: string): string =>
  `place-count:${placeId}`;

/**
 * One token-count distribution per place: the Place tokens metric an
 * experiment's form offers, generated for every place of the net.
 */
export const placeCountMetricSpecs = (
  places: SDCPN["places"],
): MonteCarloMetricSpec[] =>
  places.map((place) => ({
    kind: "placeTokenCountMean",
    id: placeCountMetricId(place.id),
    label: `${place.name} tokens`,
    placeId: place.id,
    // Every run counts at every sample: one that deadlocked or reached the
    // end keeps its last state. The default samples only runs still going,
    // which empties the last sample and biases a net whose runs stop early.
    sampleRuns: "all",
    runOutput: { type: "distribution", binning: "exact" },
  }));

/** A place's token count across the runs of an experiment, at one sample. */
export type CountStatistics = {
  /** Runs the statistics are over. */
  readonly runCount: number;
  readonly mean: number;
  readonly standardDeviation: number;
  /** Token count and how many runs held it. */
  readonly bins: readonly MonteCarloUserDefinedMetricDistributionBin[];
};

/** The mean and spread of a distribution, or null when no run was sampled. */
export const countStatisticsOfBins = (
  bins: readonly MonteCarloUserDefinedMetricDistributionBin[],
): CountStatistics | null => {
  let runCount = 0;
  let sum = 0;
  for (const [value, frequency] of bins) {
    runCount += frequency;
    sum += value * frequency;
  }
  if (runCount === 0) {
    return null;
  }
  const mean = sum / runCount;
  let squares = 0;
  for (const [value, frequency] of bins) {
    squares += frequency * (value - mean) ** 2;
  }
  return {
    runCount,
    mean,
    standardDeviation: Math.sqrt(squares / runCount),
    bins,
  };
};

/**
 * An experiment read by time, as a single run's events are: a consumer asks
 * for a time and gets what the metric frames hold at the last sample at or
 * before it.
 */
export interface ExperimentReader {
  /** Simulation time every metric has been sampled up to. */
  coveredTime(this: void): number;
  /** A metric's frames in sample order. The array grows; do not keep it. */
  metricFrames(
    this: void,
    metricId: string,
  ): readonly MonteCarloUserDefinedMetricFrame[];
  /** A metric's frame at the last sample at or before `time`. */
  metricFrameAt(
    this: void,
    metricId: string,
    time: number,
  ): MonteCarloUserDefinedMetricFrame | null;
  /** The statistics of a distribution frame, computed once per frame. */
  statisticsOf(
    this: void,
    frame: MonteCarloUserDefinedMetricFrame,
  ): CountStatistics | null;
  /** A place's token count across runs at `time`. */
  placeCountAt(
    this: void,
    placeId: string,
    time: number,
  ): CountStatistics | null;
}

const NO_FRAMES: readonly MonteCarloUserDefinedMetricFrame[] = [];

/**
 * Reads an experiment's metric frames by time.
 *
 * The store publishes one flat array that grows by appending; the reader
 * keeps the frames by metric and by sample, extending what it has when the
 * array only grew and starting over when a frame it holds was replaced, as
 * a backend that refines its samples does.
 */
export const createExperimentReader = (
  metrics: ReadableStore<MonteCarloExperimentMetrics>,
): ExperimentReader => {
  /** The published array the index was last brought up to. */
  let indexed: readonly MonteCarloUserDefinedMetricFrame[] = NO_FRAMES;
  let byMetric = new Map<string, MonteCarloUserDefinedMetricFrame[]>();
  const statistics = new WeakMap<
    MonteCarloUserDefinedMetricFrame,
    CountStatistics | null
  >();

  const index = (): Map<string, MonteCarloUserDefinedMetricFrame[]> => {
    const { frames } = metrics.get();
    if (frames === indexed) {
      return byMetric;
    }
    // A refinement may replace any frame and keep the rest, the last one
    // included, so every frame already indexed is checked, once per array.
    const grewOnly =
      frames.length >= indexed.length &&
      indexed.every((frame, at) => frames[at] === frame);
    if (!grewOnly) {
      byMetric = new Map();
    }
    for (let at = grewOnly ? indexed.length : 0; at < frames.length; at++) {
      const frame = frames[at]!;
      let series = byMetric.get(frame.metricId);
      if (!series) {
        series = [];
        byMetric.set(frame.metricId, series);
      }
      // A frame's number is its position on the sample grid; a sample
      // delivered again replaces the one before it.
      series[frame.frameNumber] = frame;
    }
    indexed = frames;
    return byMetric;
  };

  const metricFrameAt: ExperimentReader["metricFrameAt"] = (metricId, time) => {
    const series = index().get(metricId);
    if (!series || series.length === 0) {
      return null;
    }
    let low = 0;
    let high = series.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const frame = series[middle];
      if (frame && frame.time <= time) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found === -1 ? null : (series[found] ?? null);
  };

  const statisticsOf: ExperimentReader["statisticsOf"] = (frame) => {
    if (frame.outputType !== "distribution") {
      return null;
    }
    let cached = statistics.get(frame);
    if (cached === undefined) {
      cached = countStatisticsOfBins(frame.bins);
      statistics.set(frame, cached);
    }
    return cached;
  };

  return {
    coveredTime: () => {
      let covered = Number.POSITIVE_INFINITY;
      for (const series of index().values()) {
        covered = Math.min(covered, series[series.length - 1]?.time ?? 0);
      }
      return Number.isFinite(covered) ? covered : 0;
    },
    metricFrames: (metricId) => index().get(metricId) ?? NO_FRAMES,
    metricFrameAt,
    statisticsOf,
    placeCountAt: (placeId, time) => {
      const frame = metricFrameAt(placeCountMetricId(placeId), time);
      return frame ? statisticsOf(frame) : null;
    },
  };
};
