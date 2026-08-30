/**
 * Merging of metric frames produced by the shards of one sharded experiment.
 *
 * A sharded experiment splits its runs across several workers, each of which
 * aggregates only its own runs. Recombining those partial results is what makes
 * shard layout invisible in the output, and it is only sound because the
 * per-frame aggregates form monoids:
 *
 * - **distribution** frames carry bins, which merge by summing frequencies;
 * - **scalar** frames carry `runAggregate`, which merges through
 *   `createMonteCarloMetricNumericAccumulator(...).merge` — `frameValue` itself
 *   cannot be merged, because a mean of means is not a mean.
 *
 * Time aggregation is handled differently per output type. Distribution metrics
 * aggregate each *run* over time, and every run lives in exactly one shard, so
 * that work is already correct shard-locally. Scalar metrics aggregate the
 * cross-run frame value over time, which depends on the merged value, so it is
 * recomputed here as frames finalise.
 */
import {
  createMonteCarloMetricNumericAccumulator,
  type MonteCarloMetricNumericAccumulatorState,
} from "./accumulators";

import type {
  MonteCarloUserDefinedMetricDistributionBin,
  MonteCarloUserDefinedMetricFrame,
} from "./types";

type ShardFrame = {
  shardIndex: number;
  frame: MonteCarloUserDefinedMetricFrame;
};

/**
 * Sums bin frequencies across shard frames.
 *
 * Every shard bins with the same configuration, so equal bin values are the
 * same bucket and can be added directly.
 */
function mergeDistributionBins(
  shardFrames: readonly ShardFrame[],
): MonteCarloUserDefinedMetricDistributionBin[] {
  const totals = new Map<number, number>();

  for (const { frame } of shardFrames) {
    if (frame.outputType !== "distribution") {
      continue;
    }
    for (const [value, frequency] of frame.bins) {
      totals.set(value, (totals.get(value) ?? 0) + frequency);
    }
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, frequency]) => [value, frequency]);
}

/**
 * Combines one metric's frames for a single frame number across shards.
 *
 * Shards are folded in index order so the result never depends on which worker
 * replied first. That matters for the `last` aggregation, which then resolves to
 * the highest-indexed shard that sampled anything — mirroring the
 * single-simulator behaviour of taking the highest run index.
 */
function mergeShardFramesForFrameNumber(
  unordered: readonly ShardFrame[],
): MonteCarloUserDefinedMetricFrame {
  if (unordered.length === 0) {
    throw new Error("Cannot merge an empty set of metric shard frames");
  }

  const shardFrames = [...unordered].sort(
    (left, right) => left.shardIndex - right.shardIndex,
  );
  const first = shardFrames[0]!.frame;
  if (shardFrames.length === 1) {
    return first;
  }

  let runSampleCount = 0;
  let timeSampleCount = 0;
  for (const { frame } of shardFrames) {
    runSampleCount += frame.runSampleCount;
    timeSampleCount += frame.timeSampleCount;
  }

  if (first.outputType === "distribution") {
    return {
      ...first,
      bins: mergeDistributionBins(shardFrames),
      runSampleCount,
      timeSampleCount,
    };
  }

  const accumulator = createMonteCarloMetricNumericAccumulator(
    first.aggregateRuns,
  );
  let runAggregate: MonteCarloMetricNumericAccumulatorState =
    accumulator.empty();
  for (const { frame } of shardFrames) {
    if (frame.outputType !== "scalar") {
      continue;
    }
    runAggregate = accumulator.merge(runAggregate, frame.runAggregate);
  }

  const frameValue = accumulator.read(runAggregate);

  return {
    ...first,
    frameValue,
    // Overwritten by the time-aggregation pass when one is configured.
    value: frameValue,
    timeValue: null,
    runAggregate,
    runSampleCount,
    timeSampleCount,
  };
}

type TimeAggregationState = {
  frameCount: number;
  state: MonteCarloMetricNumericAccumulatorState | null;
};

/**
 * Streaming merger for a sharded experiment's metric frames.
 *
 * Shards report independently and at different rates, so a frame number can
 * only be finalised once every shard that is still running has reported it.
 * Shards that finish early are excluded from that watermark rather than
 * blocking it — which is also why merged output matches an unsharded run: a
 * finished shard has no active runs left to contribute, exactly like the
 * completed runs a single simulator skips.
 */
export function createMonteCarloMetricShardMerger(shardCount: number): {
  /** Buffers a shard's frames and returns any frames that are now final. */
  accept: (
    shardIndex: number,
    frames: readonly MonteCarloUserDefinedMetricFrame[],
  ) => MonteCarloUserDefinedMetricFrame[];
  /** Drops a shard from the watermark and releases whatever that unblocks. */
  finishShard: (shardIndex: number) => MonteCarloUserDefinedMetricFrame[];
  /** Releases every buffered frame regardless of the watermark. */
  flush: () => MonteCarloUserDefinedMetricFrame[];
} {
  if (!Number.isInteger(shardCount) || shardCount <= 0) {
    throw new Error("Metric shard merger requires a positive shard count");
  }

  /**
   * metricId -> frameNumber -> one entry per contributing shard.
   *
   * Entries keep their shard index because shards report asynchronously but
   * merging must be deterministic: the `last` aggregation resolves by shard
   * order, not arrival order.
   */
  const buffered = new Map<string, Map<number, ShardFrame[]>>();
  const highestFrameByShard = new Array<number>(shardCount).fill(-1);
  const finished = new Array<boolean>(shardCount).fill(false);
  const timeAggregation = new Map<string, TimeAggregationState>();

  const getWatermark = (): number => {
    let watermark = Number.POSITIVE_INFINITY;
    for (let shard = 0; shard < shardCount; shard++) {
      if (finished[shard]) {
        continue;
      }
      watermark = Math.min(watermark, highestFrameByShard[shard]!);
    }
    return watermark;
  };

  /**
   * Applies the configured time aggregation to a finalised scalar frame.
   *
   * Called strictly in ascending frame order per metric, so the accumulator
   * sees the merged frame values in simulation order.
   */
  const applyTimeAggregation = (
    frame: MonteCarloUserDefinedMetricFrame,
  ): MonteCarloUserDefinedMetricFrame => {
    if (frame.outputType !== "scalar" || frame.aggregateTime === "none") {
      return frame;
    }

    const accumulator = createMonteCarloMetricNumericAccumulator(
      frame.aggregateTime,
    );
    let entry = timeAggregation.get(frame.metricId);
    if (!entry) {
      entry = { frameCount: 0, state: null };
      timeAggregation.set(frame.metricId, entry);
    }

    if (frame.frameValue !== null) {
      entry.state = accumulator.add(
        entry.state ?? accumulator.empty(),
        frame.frameValue,
      );
      entry.frameCount += 1;
    }

    const timeValue = entry.state ? accumulator.read(entry.state) : null;

    return {
      ...frame,
      timeValue,
      value: timeValue ?? frame.frameValue,
      timeSampleCount: entry.frameCount,
    };
  };

  const drainUpTo = (watermark: number): MonteCarloUserDefinedMetricFrame[] => {
    const released: MonteCarloUserDefinedMetricFrame[] = [];

    for (const [metricId, byFrameNumber] of buffered) {
      const ready = [...byFrameNumber.keys()]
        .filter((frameNumber) => frameNumber <= watermark)
        .sort((left, right) => left - right);

      for (const frameNumber of ready) {
        released.push(
          applyTimeAggregation(
            mergeShardFramesForFrameNumber(byFrameNumber.get(frameNumber)!),
          ),
        );
        byFrameNumber.delete(frameNumber);
      }

      if (byFrameNumber.size === 0) {
        buffered.delete(metricId);
      }
    }

    // Frames are released per metric above; order them globally so consumers
    // that append to a flat timeline see monotonic frame numbers.
    return released.sort((left, right) => left.frameNumber - right.frameNumber);
  };

  return {
    accept(shardIndex, frames) {
      if (shardIndex < 0 || shardIndex >= shardCount) {
        throw new Error(`Unknown metric shard index ${shardIndex}`);
      }

      for (const frame of frames) {
        let byFrameNumber = buffered.get(frame.metricId);
        if (!byFrameNumber) {
          byFrameNumber = new Map();
          buffered.set(frame.metricId, byFrameNumber);
        }

        const existing = byFrameNumber.get(frame.frameNumber);
        if (existing) {
          existing.push({ shardIndex, frame });
        } else {
          byFrameNumber.set(frame.frameNumber, [{ shardIndex, frame }]);
        }

        highestFrameByShard[shardIndex] = Math.max(
          highestFrameByShard[shardIndex]!,
          frame.frameNumber,
        );
      }

      return drainUpTo(getWatermark());
    },

    finishShard(shardIndex) {
      if (shardIndex < 0 || shardIndex >= shardCount) {
        throw new Error(`Unknown metric shard index ${shardIndex}`);
      }

      finished[shardIndex] = true;
      return drainUpTo(getWatermark());
    },

    flush() {
      return drainUpTo(Number.POSITIVE_INFINITY);
    },
  };
}
