import type { SimulationConfig } from "../api";
import { buildSimulation } from "../engine/build-simulation";
import {
  computeNextFrame,
  type SimulationCompletionReason,
} from "../engine/compute-next-frame";
import { nextRandom } from "../engine/seeded-rng";
import type { EngineFrame, SimulationInstance } from "../engine/types";

export type MonteCarloRunStopReason = SimulationCompletionReason | "frameLimit";

export type MonteCarloFrameView = {
  readonly frameNumber: number;
  readonly time: number;
  getPlaceTokenCount(this: void, placeId: string): number;
  getTransitionState(
    this: void,
    transitionId: string,
  ): {
    timeSinceLastFiringMs: number;
    firedInThisFrame: boolean;
    firingCount: number;
  } | null;
  getTransitionFiringCount(this: void, transitionId: string): number;
};

export type MonteCarloMetricContext = {
  readonly runIndex: number;
  readonly runSeed: number;
  readonly frameNumber: number;
  readonly time: number;
};

export type MonteCarloDistributionConfig = {
  /** Width of each bucket. Must be greater than 0. */
  bucketSize: number;
  /** Optional inclusive lower bound. Values below it are counted as underflow. */
  min?: number;
  /** Optional exclusive upper bound. Values at or above it are counted as overflow. */
  max?: number;
};

export type MonteCarloDistributionBucket = {
  start: number;
  end: number;
  count: number;
};

export type MonteCarloDistributionSummary = {
  bucketSize: number;
  buckets: MonteCarloDistributionBucket[];
  underflow: number;
  overflow: number;
};

export type MonteCarloMetricDefinition = {
  id: string;
  label?: string;
  sample(
    this: void,
    frame: MonteCarloFrameView,
    context: MonteCarloMetricContext,
  ): number;
  distribution?: MonteCarloDistributionConfig;
};

export type MonteCarloAggregateSeries = {
  /** Column IDs. Values are stored at `frameIndex * ids.length + idIndex`. */
  ids: string[];
  frameCount: number;
  samples: Uint32Array;
  mean: Float64Array;
  min: Float64Array;
  max: Float64Array;
};

export type MonteCarloFrameSeries = {
  frameCount: number;
  times: Float64Array;
  samples: Uint32Array;
};

export type MonteCarloMetricSeries = MonteCarloAggregateSeries & {
  distributions: Record<string, MonteCarloDistributionSummary>;
};

export type MonteCarloSimulationResult = {
  runCount: number;
  frameCount: number;
  frames: MonteCarloFrameSeries;
  placeTokenCounts: MonteCarloAggregateSeries;
  metrics: MonteCarloMetricSeries;
  stopReasons: Record<MonteCarloRunStopReason, number>;
};

export type MonteCarloSimulatorConfig = Omit<
  SimulationConfig,
  "backpressure" | "signal"
> & {
  /** Number of concrete simulations to run. */
  runCount: number;
  /**
   * Maximum number of frames to record per concrete simulation, including
   * frame 0. Required when `maxTime` is null.
   */
  maxFrames?: number;
  /**
   * Optional streaming metric hooks. Each metric is sampled synchronously for
   * each retained aggregate frame; callers should not retain `frame`.
   */
  metrics?: readonly MonteCarloMetricDefinition[];
};

export type MonteCarloSimulator = {
  run(this: void): MonteCarloSimulationResult;
};

class FrameAccumulator {
  private times = new Float64Array(16);
  private samples = new Uint32Array(16);
  private frameCount = 0;

  observe(frameNumber: number, time: number): void {
    this.ensureFrame(frameNumber);
    if (this.samples[frameNumber] === 0) {
      this.times[frameNumber] = time;
    }
    this.samples[frameNumber] = (this.samples[frameNumber] ?? 0) + 1;
    this.frameCount = Math.max(this.frameCount, frameNumber + 1);
  }

  finalize(): MonteCarloFrameSeries {
    return {
      frameCount: this.frameCount,
      times: this.times.slice(0, this.frameCount),
      samples: this.samples.slice(0, this.frameCount),
    };
  }

  private ensureFrame(frameNumber: number): void {
    if (frameNumber < this.times.length) {
      return;
    }

    let capacity = this.times.length;
    while (capacity <= frameNumber) {
      capacity *= 2;
    }

    const nextTimes = new Float64Array(capacity);
    nextTimes.set(this.times);
    this.times = nextTimes;

    const nextSamples = new Uint32Array(capacity);
    nextSamples.set(this.samples);
    this.samples = nextSamples;
  }
}

class AggregateSeriesAccumulator {
  private samples = new Uint32Array(16);
  private sums = new Float64Array(16);
  private min = new Float64Array(16);
  private max = new Float64Array(16);
  private frameCount = 0;

  constructor(private readonly ids: readonly string[]) {
    this.min.fill(Number.POSITIVE_INFINITY);
    this.max.fill(Number.NEGATIVE_INFINITY);
  }

  observe(frameNumber: number, idIndex: number, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Monte Carlo aggregate value must be finite, got ${value}`,
      );
    }

    const index = this.index(frameNumber, idIndex);
    this.ensureIndex(index);
    this.samples[index] = (this.samples[index] ?? 0) + 1;
    this.sums[index] = (this.sums[index] ?? 0) + value;
    this.min[index] = Math.min(this.min[index]!, value);
    this.max[index] = Math.max(this.max[index]!, value);
    this.frameCount = Math.max(this.frameCount, frameNumber + 1);
  }

  finalize(frameCount = this.frameCount): MonteCarloAggregateSeries {
    const size = frameCount * this.ids.length;
    const samples = this.samples.slice(0, size);
    const mean = new Float64Array(size);
    const min = new Float64Array(size);
    const max = new Float64Array(size);

    for (let index = 0; index < size; index++) {
      const count = samples[index]!;
      if (count === 0) {
        mean[index] = Number.NaN;
        min[index] = Number.NaN;
        max[index] = Number.NaN;
        continue;
      }

      mean[index] = this.sums[index]! / count;
      min[index] = this.min[index]!;
      max[index] = this.max[index]!;
    }

    return {
      ids: [...this.ids],
      frameCount,
      samples,
      mean,
      min,
      max,
    };
  }

  private index(frameNumber: number, idIndex: number): number {
    return frameNumber * this.ids.length + idIndex;
  }

  private ensureIndex(index: number): void {
    if (index < this.samples.length) {
      return;
    }

    let capacity = this.samples.length;
    while (capacity <= index) {
      capacity *= 2;
    }

    const nextSamples = new Uint32Array(capacity);
    nextSamples.set(this.samples);
    this.samples = nextSamples;

    const nextSums = new Float64Array(capacity);
    nextSums.set(this.sums);
    this.sums = nextSums;

    const nextMin = new Float64Array(capacity);
    nextMin.fill(Number.POSITIVE_INFINITY);
    nextMin.set(this.min);
    this.min = nextMin;

    const nextMax = new Float64Array(capacity);
    nextMax.fill(Number.NEGATIVE_INFINITY);
    nextMax.set(this.max);
    this.max = nextMax;
  }
}

class DistributionAccumulator {
  private readonly buckets = new Map<number, number>();
  private underflow = 0;
  private overflow = 0;

  constructor(private readonly config: MonteCarloDistributionConfig) {
    if (!Number.isFinite(config.bucketSize) || config.bucketSize <= 0) {
      throw new Error("Monte Carlo distribution bucketSize must be > 0");
    }
    if (
      config.min !== undefined &&
      config.max !== undefined &&
      config.min >= config.max
    ) {
      throw new Error("Monte Carlo distribution min must be less than max");
    }
  }

  observe(value: number): void {
    const { bucketSize, min, max } = this.config;
    if (!Number.isFinite(value)) {
      throw new Error(
        `Monte Carlo distribution value must be finite, got ${value}`,
      );
    }
    if (min !== undefined && value < min) {
      this.underflow++;
      return;
    }
    if (max !== undefined && value >= max) {
      this.overflow++;
      return;
    }

    const origin = min ?? 0;
    const bucketIndex = Math.floor((value - origin) / bucketSize);
    this.buckets.set(bucketIndex, (this.buckets.get(bucketIndex) ?? 0) + 1);
  }

  finalize(): MonteCarloDistributionSummary {
    const { bucketSize, min } = this.config;
    const origin = min ?? 0;
    return {
      bucketSize,
      buckets: Array.from(this.buckets.entries())
        .sort(([left], [right]) => left - right)
        .map(([bucketIndex, count]) => {
          const start = origin + bucketIndex * bucketSize;
          return {
            start,
            end: start + bucketSize,
            count,
          };
        }),
      underflow: this.underflow,
      overflow: this.overflow,
    };
  }
}

function createFrameView(
  frame: EngineFrame,
  frameNumber: number,
  time: number,
): MonteCarloFrameView {
  return {
    frameNumber,
    time,
    getPlaceTokenCount(placeId) {
      return frame.places[placeId]?.count ?? 0;
    },
    getTransitionState(transitionId) {
      const transition = frame.transitions[transitionId];
      return transition ? { ...transition } : null;
    },
    getTransitionFiringCount(transitionId) {
      return frame.transitions[transitionId]?.firingCount ?? 0;
    },
  };
}

function keepOnlyLatestFrame(
  simulation: SimulationInstance,
): SimulationInstance {
  const latestFrame = simulation.frames[simulation.currentFrameNumber];
  if (!latestFrame) {
    throw new Error("Cannot retain latest frame from an empty simulation");
  }

  const retained = simulation;
  retained.frames[0] = latestFrame;
  retained.frames.length = 1;
  retained.currentFrameNumber = 0;
  return retained;
}

function validateUniqueIds(kind: string, ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate Monte Carlo ${kind} id: ${id}`);
    }
    seen.add(id);
  }
}

function validateConfig(config: MonteCarloSimulatorConfig): void {
  if (!Number.isInteger(config.runCount) || config.runCount <= 0) {
    throw new Error("Monte Carlo runCount must be a positive integer");
  }
  if (!Number.isFinite(config.dt) || config.dt <= 0) {
    throw new Error("Monte Carlo dt must be > 0");
  }
  if (config.maxFrames !== undefined) {
    if (!Number.isInteger(config.maxFrames) || config.maxFrames <= 0) {
      throw new Error("Monte Carlo maxFrames must be a positive integer");
    }
  } else if (config.maxTime === null) {
    throw new Error("Monte Carlo maxFrames is required when maxTime is null");
  }

  validateUniqueIds(
    "metric",
    (config.metrics ?? []).map((metric) => metric.id),
  );
}

function observeFrame(params: {
  frame: EngineFrame;
  frameNumber: number;
  time: number;
  runIndex: number;
  runSeed: number;
  placeIds: readonly string[];
  metrics: readonly MonteCarloMetricDefinition[];
  frames: FrameAccumulator;
  placeTokenCounts: AggregateSeriesAccumulator;
  metricValues: AggregateSeriesAccumulator;
  metricDistributions: Map<string, DistributionAccumulator>;
}): void {
  const {
    frame,
    frameNumber,
    time,
    runIndex,
    runSeed,
    placeIds,
    metrics,
    frames,
    placeTokenCounts,
    metricValues,
    metricDistributions,
  } = params;

  frames.observe(frameNumber, time);

  for (let placeIndex = 0; placeIndex < placeIds.length; placeIndex++) {
    const placeId = placeIds[placeIndex]!;
    placeTokenCounts.observe(
      frameNumber,
      placeIndex,
      frame.places[placeId]?.count ?? 0,
    );
  }

  if (metrics.length === 0) {
    return;
  }

  const frameView = createFrameView(frame, frameNumber, time);
  const context: MonteCarloMetricContext = {
    runIndex,
    runSeed,
    frameNumber,
    time,
  };

  for (let metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
    const metric = metrics[metricIndex]!;
    const value = metric.sample(frameView, context);
    metricValues.observe(frameNumber, metricIndex, value);
    metricDistributions.get(metric.id)?.observe(value);
  }
}

export function createMonteCarloSimulator(
  config: MonteCarloSimulatorConfig,
): MonteCarloSimulator {
  validateConfig(config);

  return {
    run() {
      const placeIds = config.sdcpn.places.map((place) => place.id);
      validateUniqueIds("place", placeIds);

      const metrics = config.metrics ?? [];
      const frames = new FrameAccumulator();
      const placeTokenCounts = new AggregateSeriesAccumulator(placeIds);
      const metricValues = new AggregateSeriesAccumulator(
        metrics.map((metric) => metric.id),
      );
      const metricDistributions = new Map<string, DistributionAccumulator>();

      for (const metric of metrics) {
        if (metric.distribution) {
          metricDistributions.set(
            metric.id,
            new DistributionAccumulator(metric.distribution),
          );
        }
      }

      const stopReasons: Record<MonteCarloRunStopReason, number> = {
        deadlock: 0,
        maxTime: 0,
        frameLimit: 0,
      };
      let nextRunSeed = config.seed;

      for (let runIndex = 0; runIndex < config.runCount; runIndex++) {
        const runSeed = nextRunSeed;
        const [, derivedSeed] = nextRandom(nextRunSeed + runIndex + 1);
        nextRunSeed = derivedSeed;

        let simulation = buildSimulation({
          sdcpn: config.sdcpn,
          initialMarking: config.initialMarking,
          parameterValues: config.parameterValues,
          seed: runSeed,
          dt: config.dt,
          maxTime: config.maxTime,
        });
        let frameNumber = 0;

        observeFrame({
          frame: simulation.frames[0]!,
          frameNumber,
          time: simulation.currentTime,
          runIndex,
          runSeed,
          placeIds,
          metrics,
          frames,
          placeTokenCounts,
          metricValues,
          metricDistributions,
        });

        let stopReason: MonteCarloRunStopReason | null = null;
        while (stopReason === null) {
          if (
            config.maxFrames !== undefined &&
            frameNumber + 1 >= config.maxFrames
          ) {
            stopReason = "frameLimit";
            break;
          }

          if (
            config.maxTime !== null &&
            simulation.currentTime >= config.maxTime
          ) {
            stopReason = "maxTime";
            break;
          }

          const result = computeNextFrame(simulation);
          if (result.simulation === simulation) {
            stopReason = result.completionReason ?? "frameLimit";
            break;
          }

          simulation = keepOnlyLatestFrame(result.simulation);
          frameNumber++;

          observeFrame({
            frame: simulation.frames[0]!,
            frameNumber,
            time: simulation.currentTime,
            runIndex,
            runSeed,
            placeIds,
            metrics,
            frames,
            placeTokenCounts,
            metricValues,
            metricDistributions,
          });

          stopReason = result.completionReason;
        }

        stopReasons[stopReason]++;
      }

      const frameSeries = frames.finalize();
      const frameCount = frameSeries.frameCount;
      const distributions: Record<string, MonteCarloDistributionSummary> = {};
      for (const [metricId, distribution] of metricDistributions) {
        distributions[metricId] = distribution.finalize();
      }

      return {
        runCount: config.runCount,
        frameCount,
        frames: frameSeries,
        placeTokenCounts: placeTokenCounts.finalize(frameCount),
        metrics: {
          ...metricValues.finalize(frameCount),
          distributions,
        },
        stopReasons,
      };
    },
  };
}
